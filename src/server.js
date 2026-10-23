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

// ---------- Utilitaires ----------

// Express 4 n'attrape pas les erreurs des fonctions async : ce wrapper s'en charge
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const requireLogin = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Non connecté' });

const requireAdmin = (req, res, next) =>
  req.session.user?.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'Réservé aux admins' });

const requireModerator = (req, res, next) =>
  req.session.user?.role === 'moderator'
    ? next()
    : res.status(403).json({ error: 'Réservé aux modérateurs' });

// ---------- Santé ----------

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- Inscription / connexion ----------

// Liste des assos validées (pour "rejoindre une association")
app.get(
  '/api/public/associations',
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT a.id, a.name FROM associations a JOIN groups g ON g.id = a.group_id
       WHERE g.name = 'Lannion' AND a.status = 'approved' ORDER BY a.name`
    );
    res.json(r.rows);
  })
);

// Inscription : créer une asso OU rejoindre une asso
app.post(
  '/api/register',
  wrap(async (req, res) => {
    const { mode, email, password, associationName, description, contact, associationId } = req.body;
    if (!['create', 'join'].includes(mode) || !email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Champs manquants (mot de passe : 8 caractères min.)' });
    }
    if ((mode === 'create' && !associationName) || (mode === 'join' && !associationId)) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query("SELECT id FROM groups WHERE name = 'Lannion'");
      const groupId = group.rows[0].id;
      let assoId, role, status, message;

      if (mode === 'create') {
        const asso = await client.query(
          `INSERT INTO associations (group_id, name, description, contact)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [groupId, associationName, description || null, contact || null]
        );
        assoId = asso.rows[0].id;
        role = 'moderator';
        status = 'approved';
        message = 'Association créée, en attente de validation par un admin du groupe.';
      } else {
        const asso = await client.query(
          "SELECT id FROM associations WHERE id = $1 AND group_id = $2 AND status = 'approved'",
          [associationId, groupId]
        );
        if (!asso.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Association introuvable' });
        }
        assoId = asso.rows[0].id;
        role = 'member';
        status = 'pending';
        message = 'Demande envoyée, en attente de validation par le modérateur de ton association.';
      }

      const hash = await bcrypt.hash(password, 12);
      await client.query(
        `INSERT INTO users (association_id, group_id, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [assoId, groupId, email.toLowerCase(), hash, role, status]
      );
      await client.query('COMMIT');
      res.status(201).json({ message });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: "E-mail ou nom d'association déjà utilisé" });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

// Connexion
app.post(
  '/api/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query(
      `SELECT u.*, a.status AS asso_status
       FROM users u LEFT JOIN associations a ON a.id = u.association_id
       WHERE u.email = $1`,
      [(email || '').toLowerCase()]
    );
    const user = result.rows[0];
    const ok = user && (await bcrypt.compare(password || '', user.password_hash));
    if (!ok) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect' });

    if (user.role !== 'admin') {
      if (user.asso_status === 'pending')
        return res.status(403).json({ error: 'Association en attente de validation par un admin' });
      if (user.asso_status === 'rejected')
        return res.status(403).json({ error: 'Association refusée dans le groupe' });
      if (user.status === 'pending')
        return res
          .status(403)
          .json({ error: 'Compte en attente de validation par le modérateur de ton association' });
      if (user.status === 'rejected')
        return res.status(403).json({ error: 'Ta demande a été refusée par le modérateur' });
    }

    req.session.user = {
      id: user.id,
      role: user.role,
      groupId: user.group_id,
      associationId: user.association_id,
    };
    res.json({ role: user.role });
  })
);

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireLogin, (req, res) => res.json(req.session.user));

// ---------- Admin du groupe : valider / refuser les associations ----------

app.get(
  '/api/admin/pending',
  requireLogin,
  requireAdmin,
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT a.id, a.name, a.description, a.contact, u.email
       FROM associations a
       JOIN users u ON u.association_id = a.id AND u.role = 'moderator'
       WHERE a.status = 'pending' AND a.group_id = $1
       ORDER BY a.created_at`,
      [req.session.user.groupId]
    );
    res.json(r.rows);
  })
);

app.post(
  '/api/admin/associations/:id/:action',
  requireLogin,
  requireAdmin,
  wrap(async (req, res) => {
    const { id, action } = req.params;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action inconnue' });
    }
    const r = await pool.query(
      'UPDATE associations SET status = $1 WHERE id = $2 AND group_id = $3 RETURNING id',
      [action === 'approve' ? 'approved' : 'rejected', id, req.session.user.groupId]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Association introuvable' });
    res.json({ ok: true });
  })
);

// ---------- Modérateur d'asso : valider / refuser les personnes ----------

app.get(
  '/api/moderator/pending',
  requireLogin,
  requireModerator,
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT id, email FROM users
       WHERE association_id = $1 AND role = 'member' AND status = 'pending'
       ORDER BY created_at`,
      [req.session.user.associationId]
    );
    res.json(r.rows);
  })
);

app.post(
  '/api/moderator/users/:id/:action',
  requireLogin,
  requireModerator,
  wrap(async (req, res) => {
    const { id, action } = req.params;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action inconnue' });
    }
    const r = await pool.query(
      `UPDATE users SET status = $1
       WHERE id = $2 AND association_id = $3 AND role = 'member' RETURNING id`,
      [action === 'approve' ? 'approved' : 'rejected', id, req.session.user.associationId]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Personne introuvable' });
    res.json({ ok: true });
  })
);

// ---------- Types d'activités (communs + ceux de mon asso) ----------

app.get(
  '/api/types',
  requireLogin,
  wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT id, name, color FROM activity_types
       WHERE association_id IS NULL OR association_id = $1 ORDER BY name`,
      [req.session.user.associationId]
    );
    res.json(r.rows);
  })
);

// ---------- Activités ----------

// Activités du groupe, au format FullCalendar
app.get(
  '/api/activities',
  requireLogin,
  wrap(async (req, res) => {
    const { groupId, associationId, role } = req.session.user;
    const r = await pool.query(
      `SELECT ac.*, a.name AS association_name, t.name AS type_name, t.color
       FROM activities ac
       JOIN associations a ON a.id = ac.association_id
       LEFT JOIN activity_types t ON t.id = ac.type_id
       WHERE a.group_id = $1 AND a.status = 'approved'
       ORDER BY ac.start_at`,
      [groupId]
    );
    res.json(
      r.rows.map((ac) => {
        const mine = ac.association_id === associationId;
        const canJoin = mine || ac.access === 'commune';
        const showDetails = canJoin || role === 'admin';
        const color = canJoin ? ac.color || '#3788d8' : '#9e9e9e';
        return {
          id: ac.id,
          title: ac.title,
          start: ac.start_at,
          end: ac.end_at,
          backgroundColor: color,
          borderColor: color,
          extendedProps: {
            association: ac.association_name,
            type: ac.type_name,
            access: ac.access,
            mine,
            canJoin,
            location: showDetails ? ac.location : null,
            description: showDetails ? ac.description : null,
          },
        };
      })
    );
  })
);

// Créer une activité (membre ou modérateur d'une association)
app.post(
  '/api/activities',
  requireLogin,
  wrap(async (req, res) => {
    const { id: userId, associationId } = req.session.user;
    if (!associationId) return res.status(403).json({ error: 'Réservé aux associations' });

    const { title, typeId, start, end, location, description, access } = req.body;
    if (!title || !start || !end || !['reservee', 'commune'].includes(access)) {
      return res.status(400).json({ error: 'Champs manquants ou invalides' });
    }
    if (isNaN(new Date(start)) || isNaN(new Date(end))) {
      return res.status(400).json({ error: 'Dates invalides' });
    }
    if (new Date(end) < new Date(start)) {
      return res.status(400).json({ error: 'La fin doit être après le début' });
    }
    if (typeId) {
      const t = await pool.query(
        'SELECT 1 FROM activity_types WHERE id = $1 AND (association_id IS NULL OR association_id = $2)',
        [typeId, associationId]
      );
      if (!t.rowCount) return res.status(400).json({ error: 'Type invalide' });
    }

    const r = await pool.query(
      `INSERT INTO activities
         (association_id, created_by, type_id, title, description, start_at, end_at, location, access)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [associationId, userId, typeId || null, title, description || null, start, end, location || null, access]
    );
    res.status(201).json({ id: r.rows[0].id });
  })
);

// Supprimer (sa propre asso, ou n'importe laquelle du groupe pour un admin)
app.delete(
  '/api/activities/:id',
  requireLogin,
  wrap(async (req, res) => {
    const { groupId, associationId, role } = req.session.user;
    const r = await pool.query(
      `DELETE FROM activities WHERE id = $1 AND association_id IN
         (SELECT id FROM associations WHERE group_id = $2 AND ($3::boolean OR id = $4))`,
      [req.params.id, groupId, role === 'admin', associationId]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Activité introuvable' });
    res.json({ ok: true });
  })
);

// ---------- Gestion des erreurs ----------

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Serveur sur http://localhost:${port}`));