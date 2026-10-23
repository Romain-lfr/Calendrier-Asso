require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

app.use(express.json());
app.use(
  session({
    store: new pgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Middlewares ---
const requireLogin = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Non connecté' });

const requireAdmin = (req, res, next) =>
  req.session.user?.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'Réservé aux admins' });

// --- Santé ---
app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Inscription d'une association ---
app.post('/api/register', async (req, res) => {
  const { associationName, description, contact, email, password } = req.body;
  if (!associationName || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Champs manquants (mot de passe : 8 caractères min.)' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query("SELECT id FROM groups WHERE name = 'Lannion'");
    const groupId = group.rows[0].id;
    const asso = await client.query(
      `INSERT INTO associations (group_id, name, description, contact)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [groupId, associationName, description || null, contact || null]
    );
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (association_id, group_id, email, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [asso.rows[0].id, groupId, email.toLowerCase(), hash]
    );
    await client.query('COMMIT');
    res.status(201).json({ message: 'Inscription envoyée, en attente de validation.' });
  } catch (err) {
    await client.query('ROLLBACK');
    const duplicate = err.code === '23505';
    res.status(duplicate ? 409 : 500).json({
      error: duplicate ? 'E-mail ou nom d\'association déjà utilisé' : 'Erreur serveur',
    });
  } finally {
    client.release();
  }
});

// --- Connexion ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    (email || '').toLowerCase(),
  ]);
  const user = result.rows[0];
  const ok = user && (await bcrypt.compare(password || '', user.password_hash));
  if (!ok) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect' });
  if (user.status !== 'approved') {
    return res.status(403).json({ error: 'Compte en attente de validation par un admin' });
  }
  req.session.user = {
    id: user.id,
    role: user.role,
    groupId: user.group_id,
    associationId: user.association_id,
  };
  res.json({ role: user.role });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireLogin, (req, res) => res.json(req.session.user));

// --- Admin : valider / refuser les inscriptions ---
app.get('/api/admin/pending', requireLogin, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT a.id, a.name, a.description, a.contact, u.email
     FROM associations a JOIN users u ON u.association_id = a.id
     WHERE a.status = 'pending' AND a.group_id = $1`,
    [req.session.user.groupId]
  );
  res.json(result.rows);
});

app.post('/api/admin/associations/:id/:action', requireLogin, requireAdmin, async (req, res) => {
  const { id, action } = req.params;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Action inconnue' });
  const approve = action === 'approve';
  const groupId = req.session.user.groupId;
  const asso = await pool.query(
    'UPDATE associations SET status = $1 WHERE id = $2 AND group_id = $3 RETURNING id',
    [approve ? 'approved' : 'rejected', id, groupId]
  );
  if (!asso.rowCount) return res.status(404).json({ error: 'Association introuvable' });
  await pool.query(
    'UPDATE users SET status = $1 WHERE association_id = $2',
    [approve ? 'approved' : 'pending', id]
  );
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Serveur sur http://localhost:${port}`));