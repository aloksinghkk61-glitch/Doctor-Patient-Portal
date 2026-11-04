CREATE TABLE IF NOT EXISTS users(
  id serial PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','doctor','staff')),
  created_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS patients(
  id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL, dob date, gender text, language text,
  phone text, address text, email text,
  emergency_name text, emergency_rel text, emergency_phone text,
  insurance_provider text, policy_no text, group_no text, subscriber text);

CREATE TABLE IF NOT EXISTS allergies(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  substance text NOT NULL, severity text, reaction text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS medications(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name text NOT NULL, dosage text, pharmacy text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS immunizations(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine text NOT NULL, date_given date, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS history(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type text NOT NULL, description text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS labs(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test text NOT NULL, result text, test_date date, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS visits(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date date NOT NULL, summary text, care_plan text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS appointments(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL, visit_type text DEFAULT 'in-person', reason text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','cancelled','completed')),
  created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS messages(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sender text NOT NULL, body text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS refills(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medication text NOT NULL, pharmacy text, notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS intake(
  id serial PRIMARY KEY, patient_id int NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  form_type text NOT NULL, answers text, created_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS audit_log(
  id bigserial PRIMARY KEY, user_id int, action text, patient_id int, ip text, at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_appt_pat ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_msg_pat ON messages(patient_id);
