const express = require('express'), { Pool } = require('pg'), bcrypt = require('bcryptjs'),
  jwt = require('jsonwebtoken'), cookieParser = require('cookie-parser'), helmet = require('helmet'),
  rateLimit = require('express-rate-limit'), fs = require('fs'), path = require('path');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) { console.error('JWT_SECRET (32+ chars) is required'); process.exit(1); }
const prod = process.env.NODE_ENV === 'production';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
const q = (s, p) => pool.query(s, p);

// resource -> columns, pw = patients may write, order = sort
const RES = {
  allergies: { c: ['substance', 'severity', 'reaction'], pw: 1, o: 'id' },
  medications: { c: ['name', 'dosage', 'pharmacy'], pw: 1, o: 'id' },
  immunizations: { c: ['vaccine', 'date_given'], o: 'date_given DESC NULLS LAST' },
  history: { c: ['type', 'description'], pw: 1, o: 'id' },
  labs: { c: ['test', 'result', 'test_date'], o: 'test_date DESC NULLS LAST' },
  visits: { c: ['visit_date', 'summary', 'care_plan'], o: 'visit_date DESC' },
  appointments: { c: ['scheduled_at', 'visit_type', 'reason'], pw: 1, o: 'scheduled_at DESC', status: ['requested', 'confirmed', 'cancelled', 'completed'] },
  messages: { c: ['body'], pw: 1, o: 'created_at', sender: 1 },
  refills: { c: ['medication', 'pharmacy', 'notes'], pw: 1, o: 'id DESC', status: ['pending', 'approved', 'denied'] },
  intake: { c: ['form_type', 'answers'], pw: 1, o: 'id DESC' },
};
const PROFILE = ['full_name', 'dob', 'gender', 'language', 'phone', 'address', 'email', 'emergency_name', 'emergency_rel', 'emergency_phone', 'insurance_provider', 'policy_no', 'group_no', 'subscriber'];

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }); });
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, 2000));
const audit = (req, action, pid) => q('INSERT INTO audit_log(user_id,action,patient_id,ip) VALUES($1,$2,$3,$4)', [req.user?.id, action, pid || null, req.ip]).catch(() => {});

function auth(req, res, next) {
  try { req.user = jwt.verify(req.cookies.token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Please sign in' }); }
}
const isStaff = u => u.role !== 'patient';
function access(req, res, next) {
  const pid = +req.params.pid;
  if (!pid || (!isStaff(req.user) && req.user.id !== pid)) return res.status(403).json({ error: 'Access denied' });
  req.pid = pid; next();
}

// ---------- Auth ----------
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
function setCookie(res, u) {
  const token = jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '30m' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 30 * 60 * 1000 });
}
app.post('/api/auth/register', limiter, wrap(async (req, res) => {
  const { email, password, full_name, dob } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 10 || !clean(full_name)) throw fail(400, 'Valid email, name and a password of 10+ characters are required');
  const hash = await bcrypt.hash(password, 12);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const u = (await c.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'patient') RETURNING id,role", [email.toLowerCase(), hash])).rows[0];
    await c.query('INSERT INTO patients(id,full_name,dob,email) VALUES($1,$2,$3,$4)', [u.id, clean(full_name), clean(dob), email.toLowerCase()]);
    await c.query('COMMIT');
    setCookie(res, u); res.json({ id: u.id, role: u.role });
  } catch (e) { await c.query('ROLLBACK'); throw e.code === '23505' ? fail(409, 'Email already registered') : e; }
  finally { c.release(); }
}));
app.post('/api/auth/login', limiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const u = (await q('SELECT * FROM users WHERE email=$1', [String(email || '').toLowerCase()])).rows[0];
  if (!u || !(await bcrypt.compare(String(password || ''), u.password_hash))) throw fail(401, 'Incorrect email or password');
  setCookie(res, u); req.user = u; audit(req, 'login');
  res.json({ id: u.id, role: u.role });
}));
app.post('/api/auth/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/me', auth, wrap(async (req, res) => {
  const p = (await q('SELECT full_name FROM patients WHERE id=$1', [req.user.id])).rows[0];
  res.json({ id: req.user.id, role: req.user.role, name: p?.full_name });
}));

// ---------- Patients ----------
app.get('/api/patients', auth, wrap(async (req, res) => {
  if (!isStaff(req.user)) throw fail(403, 'Staff only');
  audit(req, 'list_patients');
  res.json((await q('SELECT id,full_name,dob FROM patients ORDER BY full_name LIMIT 500')).rows);
}));
app.get('/api/patients/:pid', auth, access, wrap(async (req, res) => {
  audit(req, 'view_profile', req.pid);
  res.json((await q('SELECT * FROM patients WHERE id=$1', [req.pid])).rows[0] || {});
}));
app.put('/api/patients/:pid', auth, access, wrap(async (req, res) => {
  const vals = PROFILE.map(k => clean(req.body[k]));
  await q(`UPDATE patients SET ${PROFILE.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1`, [req.pid, ...vals]);
  audit(req, 'update_profile', req.pid); res.json({ ok: true });
}));

// ---------- Generic patient-owned records ----------
app.get('/api/patients/:pid/:res', auth, access, wrap(async (req, res) => {
  const r = RES[req.params.res]; if (!r) throw fail(404, 'Unknown resource');
  audit(req, 'read_' + req.params.res, req.pid);
  res.json((await q(`SELECT * FROM ${req.params.res} WHERE patient_id=$1 ORDER BY ${r.o}`, [req.pid])).rows);
}));
app.post('/api/patients/:pid/:res', auth, access, wrap(async (req, res) => {
  const r = RES[req.params.res]; if (!r) throw fail(404, 'Unknown resource');
  if (!r.pw && !isStaff(req.user)) throw fail(403, 'Only your care team can add this');
  const cols = [...r.c], vals = r.c.map(k => clean(req.body[k]));
  if (!vals[0]) throw fail(400, `${r.c[0]} is required`);
  if (r.sender) { cols.push('sender'); vals.push(req.user.role); }
  const ph = cols.map((_, i) => `$${i + 2}`).join(',');
  const row = (await q(`INSERT INTO ${req.params.res}(patient_id,${cols.join(',')}) VALUES($1,${ph}) RETURNING *`, [req.pid, ...vals])).rows[0];
  audit(req, 'create_' + req.params.res, req.pid); res.status(201).json(row);
}));
app.patch('/api/patients/:pid/:res/:id', auth, access, wrap(async (req, res) => {
  const r = RES[req.params.res], s = req.body.status;
  if (!r?.status?.includes(s)) throw fail(400, 'Invalid status');
  if (!isStaff(req.user) && s !== 'cancelled') throw fail(403, 'Patients can only cancel');
  const row = (await q(`UPDATE ${req.params.res} SET status=$1 WHERE id=$2 AND patient_id=$3 RETURNING *`, [s, +req.params.id, req.pid])).rows[0];
  if (!row) throw fail(404, 'Not found');
  audit(req, 'status_' + req.params.res, req.pid); res.json(row);
}));

// ---------- Minimal FHIR R4 read (EHR integration starting point) ----------
app.get('/fhir/Patient/:pid', auth, access, wrap(async (req, res) => {
  const p = (await q('SELECT * FROM patients WHERE id=$1', [req.pid])).rows[0]; if (!p) throw fail(404, 'Not found');
  audit(req, 'fhir_patient', req.pid);
  res.type('application/fhir+json').json({
    resourceType: 'Patient', id: String(p.id), name: [{ text: p.full_name }], gender: p.gender, birthDate: p.dob?.toISOString?.().slice(0, 10),
    telecom: [p.phone && { system: 'phone', value: p.phone }, p.email && { system: 'email', value: p.email }].filter(Boolean),
    address: p.address ? [{ text: p.address }] : [], communication: p.language ? [{ language: { text: p.language } }] : [],
  });
}));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_, res) => res.send('ok'));

(async () => {
  await q(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const { SEED_DOCTOR_EMAIL: e, SEED_DOCTOR_PASSWORD: p } = process.env;
  if (e && p) {
    const u = (await q("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'doctor') ON CONFLICT(email) DO NOTHING RETURNING id", [e.toLowerCase(), await bcrypt.hash(p, 12)])).rows[0];
    if (u) await q('INSERT INTO patients(id,full_name,email) VALUES($1,$2,$3)', [u.id, 'Care Team', e.toLowerCase()]);
  }
 // This tells your framework what to display at the home URL
app.get('/', (req, res) => {
  res.status(200).send('Doctor-Patient Portal Server is online and running successfully!');
});
