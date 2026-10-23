require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage : npm run admin -- email@exemple.fr MotDePasse');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const group = await pool.query("SELECT id FROM groups WHERE name = 'Lannion'");
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (group_id, email, password_hash, role, status)
     VALUES ($1, $2, $3, 'admin', 'approved')
     ON CONFLICT (email) DO UPDATE SET password_hash = $3`,
    [group.rows[0].id, email.toLowerCase(), hash]
  );
  console.log('Admin créé :', email);
  await pool.end();
})().catch((err) => {
  console.error('Erreur :', err.message);
  process.exit(1);
});