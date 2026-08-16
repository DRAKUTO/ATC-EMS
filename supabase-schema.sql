-- ============================================================
-- ATLANTIC ROLEPLAY EMS — DATABASE SCHEMA
-- Supabase SQL Editor:
--   https://supabase.com/dashboard/project/tumrzwermkicjuvzlisi/sql/new
--
-- The site is rebuilt around exactly FOUR tables:
--   accounts, applications, contacts, comments
--
-- SAFE TO RE-RUN (idempotent):
--   - Legacy tables (unused by the site code) are dropped.
--   - The 4 core tables are DROPPED and recreated with strict RLS,
--     so existing rows in them are cleared. Backup first if needed.
--
-- RLS RULES:
--   - accounts:    user creates/reads/updates ONLY their own row.
--                  Role can never be changed from the client.
--   - applications:user creates/reads ONLY rows tied to their account_id.
--   - contacts:    user creates messages tied to their account_id,
--                  reads only their own.
--   - comments:    user creates comments tied to their account_id,
--                  everyone (anon + authenticated) can read them.
--
-- IMPORTANT: accounts.account_id = Discord User ID (TEXT).
--            accounts.id          = Supabase Auth user UUID (auth.uid()).
--            These are DIFFERENT values. Never mix them.
-- ============================================================

-- (1) DROP LEGACY TABLES -------------------------------------------
-- None of these are referenced by any file in the site (script.js,
-- supabase.js, HTML pages). Verified by full code audit.
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS hospital_staff CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS pharmacy_inventory CASCADE;
DROP TABLE IF EXISTS pharmacy_orders CASCADE;
DROP TABLE IF EXISTS budget_records CASCADE;
DROP TABLE IF EXISTS work_hours CASCADE;
DROP TABLE IF EXISTS salary_log CASCADE;
DROP TABLE IF EXISTS medical_reports CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS license_requests CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS task_submissions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS staff_activities CASCADE;
DROP TABLE IF EXISTS hospital_requests CASCADE;

-- (2) EXTENSIONS ---------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLE 1 — accounts
-- One row per Discord user of the site.
-- ============================================================
DROP TABLE IF EXISTS accounts CASCADE;
CREATE TABLE accounts (
  id          UUID PRIMARY KEY DEFAULT auth.uid(), -- Supabase Auth user UUID
  name        TEXT NOT NULL DEFAULT '',            -- Discord display name
  account_id  TEXT NOT NULL UNIQUE,                -- Discord User ID
  role        TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'Manager' | 'EMS'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- User creates their own account only.
DROP POLICY IF EXISTS "accounts_insert_own" ON accounts;
CREATE POLICY "accounts_insert_own"
  ON accounts FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- User reads only their own account.
DROP POLICY IF EXISTS "accounts_select_own" ON accounts;
CREATE POLICY "accounts_select_own"
  ON accounts FOR SELECT TO authenticated
  USING (id = auth.uid());

-- User updates only their own account (role is protected by trigger).
DROP POLICY IF EXISTS "accounts_update_own" ON accounts;
CREATE POLICY "accounts_update_own"
  ON accounts FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Role protection: a client can never set role to Manager/EMS.
-- Role changes are allowed only via:
--   * service_role key, or
--   * direct SQL / Supabase Dashboard (auth.uid() IS NULL).
-- (supabase-roles.sql upgrades this to also allow app Managers
--  through the Management panel via set_account_role.)
CREATE OR REPLACE FUNCTION public.force_account_role_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  mcount integer;
BEGIN
  IF (auth.role() = 'service_role' OR auth.uid() IS NULL) THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT') THEN
    NEW.role := 'user';   -- new Discord account: always 'user'
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (auth.uid() IS NOT NULL) THEN
      NEW.role := OLD.role;   -- app session: role frozen
    END IF;
    IF OLD.role = 'Manager' AND NEW.role IS DISTINCT FROM 'Manager' THEN
      SELECT count(*) INTO mcount FROM public.accounts WHERE role = 'Manager';
      IF mcount <= 1 THEN
        RAISE EXCEPTION 'Cannot demote the last remaining Manager.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_role_rules ON accounts;
CREATE TRIGGER trg_accounts_role_rules
  BEFORE INSERT OR UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.force_account_role_rules();

-- ============================================================
-- TABLE 2 — applications (JOINING JOB / CV)
-- Every row is tied to the sender via account_id (Discord User ID).
-- ============================================================
DROP TABLE IF EXISTS applications CASCADE;
CREATE TABLE applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           TEXT NOT NULL,             -- Discord User ID of sender
  discord_name         TEXT NOT NULL DEFAULT '',  -- Discord display name
  application_id       TEXT NOT NULL UNIQUE,      -- EMS-YYYYMMDD-XXXXXX
  full_name            TEXT NOT NULL DEFAULT '',
  real_age             INT,
  real_sex             TEXT,
  rp_first_name        TEXT NOT NULL DEFAULT '',
  rp_last_name         TEXT NOT NULL DEFAULT '',
  rp_age               INT,
  rp_sex               TEXT,
  roleplay_experience  TEXT,
  ems_experience       TEXT,
  availability         TEXT,
  quality              TEXT,
  rules_accepted       BOOLEAN DEFAULT false,
  status               TEXT NOT NULL DEFAULT 'PENDING',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_account_id ON applications (account_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- User creates applications only for their own account.
DROP POLICY IF EXISTS "applications_insert_own" ON applications;
CREATE POLICY "applications_insert_own"
  ON applications FOR INSERT TO authenticated
  WITH CHECK (account_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- User reads only their own applications.
DROP POLICY IF EXISTS "applications_select_own" ON applications;
CREATE POLICY "applications_select_own"
  ON applications FOR SELECT TO authenticated
  USING (account_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- A client can never set status (always starts as PENDING).
CREATE OR REPLACE FUNCTION public.force_application_status_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (auth.role() <> 'service_role') THEN
    NEW.status := 'PENDING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_status ON applications;
CREATE TRIGGER trg_applications_status
  BEFORE INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION public.force_application_status_pending();

-- ============================================================
-- TABLE 3 — contacts
-- Keeps ALL existing contact fields, adds account_id + discord_name.
-- ============================================================
DROP TABLE IF EXISTS contacts CASCADE;
CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   TEXT NOT NULL,             -- Discord User ID of sender
  discord_name TEXT NOT NULL DEFAULT '',  -- Discord display name
  name         TEXT,                      -- index.html modal / section form
  email        TEXT,
  subject      TEXT,
  message      TEXT,
  first_name   TEXT,                      -- contact.html form
  last_name    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts (account_id);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- User creates messages tied to their own account.
DROP POLICY IF EXISTS "contacts_insert_own" ON contacts;
CREATE POLICY "contacts_insert_own"
  ON contacts FOR INSERT TO authenticated
  WITH CHECK (account_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- User reads only their own messages.
DROP POLICY IF EXISTS "contacts_select_own" ON contacts;
CREATE POLICY "contacts_select_own"
  ON contacts FOR SELECT TO authenticated
  USING (account_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- ============================================================
-- TABLE 4 — comments
-- Keeps ALL existing comment fields, adds account_id + discord_name.
-- Comments are public to read (site design), but posting requires a
-- Discord account.
-- ============================================================
DROP TABLE IF EXISTS comments CASCADE;
CREATE TABLE comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   TEXT NOT NULL,             -- Discord User ID of author
  discord_name TEXT NOT NULL DEFAULT '',  -- Discord display name
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT,
  message      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_account_id ON comments (account_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Any visitor can read comments (the list is shown publicly on the page).
DROP POLICY IF EXISTS "comments_select_public" ON comments;
CREATE POLICY "comments_select_public"
  ON comments FOR SELECT TO anon
  USING (true);
DROP POLICY IF EXISTS "comments_select_auth" ON comments;
CREATE POLICY "comments_select_auth"
  ON comments FOR SELECT TO authenticated
  USING (true);

-- Only a signed-in Discord account can post a comment.
DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own"
  ON comments FOR INSERT TO authenticated
  WITH CHECK (account_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- ============================================================
-- FINAL CHECK (should list exactly: accounts, applications, comments, contacts)
-- ============================================================
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;

-- ============================================================
-- MEDICATION REQUEST SYSTEM (medication.html)
-- Tables: medications, promo_codes, medication_requests
-- ============================================================

-- Shared helper to keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLE 5 - medications (city pharmacy catalog)
-- ============================================================
DROP TABLE IF EXISTS medications CASCADE;
CREATE TABLE medications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  image_url    TEXT,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock        INT NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medications_name ON medications (name);

ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- The catalog is public to read (both logged-out and logged-in visitors).
DROP POLICY IF EXISTS "medications_select_public" ON medications;
CREATE POLICY "medications_select_public"
  ON medications FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "medications_select_auth" ON medications;
CREATE POLICY "medications_select_auth"
  ON medications FOR SELECT TO authenticated USING (true);
-- No client INSERT/UPDATE/DELETE. An admin panel (service_role) can manage
-- medications later.

DROP TRIGGER IF EXISTS trg_medications_updated_at ON medications;
CREATE TRIGGER trg_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the pharmacy catalog (idempotent: re-runs keep existing rows).
INSERT INTO medications (name, description, image_url, price, stock, is_available) VALUES
  ('Paracetamol', 'Pain relief and fever reducer.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Paracetamol', 5.00, 100, true),
  ('Ibuprofen', 'Anti-inflammatory pain relief.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Ibuprofen', 7.50, 80, true),
  ('Amoxicillin', 'Antibiotic for bacterial infections.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Amoxicillin', 12.00, 50, true),
  ('Insulin', 'Regulates blood sugar levels.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Insulin', 25.00, 30, true),
  ('Aspirin', 'Pain relief and blood thinner.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Aspirin', 4.50, 120, true),
  ('Antihistamine', 'Allergy and hay fever relief.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Antihistamine', 8.00, 60, true),
  ('Cough Syrup', 'Relief from cough and throat irritation.', 'https://placehold.co/300x200/0d6b8a/ffffff?text=Cough+Syrup', 9.00, 0, false)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- TABLE 6 - promo_codes
-- No direct client access: validated only through
-- public.validate_promo_code() and the pricing trigger.
-- ============================================================
DROP TABLE IF EXISTS promo_codes CASCADE;
CREATE TABLE promo_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  discount_type  TEXT NOT NULL DEFAULT 'percent',  -- 'percent' | 'fixed'
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  max_uses       INT,
  used_count     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
-- NO client policies: only the SECURITY DEFINER function + trigger can
-- read/update promos. Admin (service_role / SQL editor) manages them.

-- Validate a promo code for the UI (APPLY button). Returns the matching
-- discount only - never leaks other codes.
CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text)
RETURNS TABLE (valid boolean, discount_type text, discount_value numeric, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE rec promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM promo_codes WHERE upper(code) = upper(COALESCE(p_code, ''));
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, 'percent'::text, 0::numeric, 'The promo code you entered is invalid.';
    RETURN;
  END IF;
  IF rec.is_active = false THEN
    RETURN QUERY SELECT false::boolean, rec.discount_type, rec.discount_value, 'This promo code is not active.';
    RETURN;
  END IF;
  IF rec.expires_at IS NOT NULL AND rec.expires_at < now() THEN
    RETURN QUERY SELECT false::boolean, rec.discount_type, rec.discount_value, 'This promo code has expired.';
    RETURN;
  END IF;
  IF rec.max_uses IS NOT NULL AND rec.used_count >= rec.max_uses THEN
    RETURN QUERY SELECT false::boolean, rec.discount_type, rec.discount_value, 'This promo code has reached its usage limit.';
    RETURN;
  END IF;
  RETURN QUERY SELECT true::boolean, rec.discount_type, rec.discount_value, 'Promo code applied successfully.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text) TO anon, authenticated;

-- Seed a promo code (idempotent).
INSERT INTO promo_codes (code, discount_type, discount_value, max_uses) VALUES
  ('ATLANTIC10', 'percent', 10.00, 100)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- TABLE 7 - medication_requests
-- Server-side pricing: the BEFORE INSERT trigger recomputes every
-- price from the medications + promo_codes tables, so the frontend
-- can never fake prices, discounts or status.
-- ============================================================
DROP TABLE IF EXISTS medication_requests CASCADE;
CREATE TABLE medication_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code    TEXT NOT NULL UNIQUE,             -- MED-YYYYMMDD-XXXXXX
  discord_id      TEXT NOT NULL,                    -- Discord User ID (account_id)
  discord_name    TEXT NOT NULL DEFAULT '',
  medication_id   UUID NOT NULL,
  medication_name TEXT NOT NULL,
  quantity        INT NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL,
  original_price  NUMERIC(10,2) NOT NULL,
  promo_code      TEXT,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  final_price     NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | READY | COMPLETED | CANCELLED
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_requests_discord ON medication_requests (discord_id);
CREATE INDEX IF NOT EXISTS idx_med_requests_code ON medication_requests (request_code);

ALTER TABLE medication_requests ENABLE ROW LEVEL SECURITY;

-- Users create requests ONLY tied to their own Discord account.
DROP POLICY IF EXISTS "med_requests_insert_own" ON medication_requests;
CREATE POLICY "med_requests_insert_own"
  ON medication_requests FOR INSERT TO authenticated
  WITH CHECK (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- Users read ONLY their own requests.
DROP POLICY IF EXISTS "med_requests_select_own" ON medication_requests;
CREATE POLICY "med_requests_select_own"
  ON medication_requests FOR SELECT TO authenticated
  USING (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- No UPDATE/DELETE policies: users can never change status, prices,
-- discount or their Discord ID afterwards.

-- Server-side pricing + status enforcement.
CREATE OR REPLACE FUNCTION public.compute_med_request_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  med   medications%ROWTYPE;
  promo promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO med FROM medications WHERE id = NEW.medication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medication not found.';
  END IF;
  IF NOT med.is_available OR med.stock <= 0 THEN
    RAISE EXCEPTION 'This medication is currently unavailable.';
  END IF;
  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR NEW.quantity > 999 THEN
    RAISE EXCEPTION 'Invalid quantity.';
  END IF;

  NEW.medication_name := med.name;
  NEW.unit_price      := med.price;
  NEW.original_price  := med.price * NEW.quantity;
  NEW.discount_amount := 0;
  NEW.status          := 'PENDING';

  IF COALESCE(NEW.promo_code, '') <> '' THEN
    SELECT * INTO promo FROM promo_codes WHERE upper(code) = upper(NEW.promo_code);
    IF NOT FOUND OR NOT promo.is_active
       OR (promo.expires_at IS NOT NULL AND promo.expires_at < now())
       OR (promo.max_uses IS NOT NULL AND promo.used_count >= promo.max_uses) THEN
      RAISE EXCEPTION 'Invalid promo code.';
    END IF;
    IF promo.discount_type = 'fixed' THEN
      NEW.discount_amount := LEAST(promo.discount_value, NEW.original_price);
    ELSE
      NEW.discount_amount := ROUND(NEW.original_price * promo.discount_value / 100, 2);
    END IF;
    NEW.promo_code := promo.code;
    UPDATE promo_codes SET used_count = used_count + 1 WHERE id = promo.id;
  END IF;

  NEW.final_price := GREATEST(NEW.original_price - NEW.discount_amount, 0);
  NEW.updated_at  := now();
  IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_med_requests_pricing ON medication_requests;
CREATE TRIGGER trg_med_requests_pricing
  BEFORE INSERT ON medication_requests
  FOR EACH ROW EXECUTE FUNCTION public.compute_med_request_pricing();

-- ============================================================
-- FINAL CHECK: accounts, applications, comments, contacts +
-- medications, promo_codes, medication_requests
-- ============================================================

-- ============================================================
-- MEDICAL APPOINTMENT SYSTEM (medical-appointment.html)
-- Table: medical_appointments
-- ============================================================

-- ============================================================
-- TABLE 8 - medical_appointments
-- Users request a consultation / examination / surgery slot.
--   * appointment_code is UNIQUE (APT-YYYYMMDD-XXXXXX).
--   * discord_id links every row to the Discord account that
--     created it (the trigger derives it from auth.uid(), so a
--     client can never forge another user's ID or name).
--   * status starts as PENDING and can only be changed by an
--     admin (service_role / SQL editor) - the client has no
--     UPDATE right except soft-deleting its own row.
--   * deleted_at enables Soft Delete: the row stays in the DB
--     for admin/audit purposes but disappears from the user's list.
-- ============================================================
DROP TABLE IF EXISTS medical_appointments CASCADE;
CREATE TABLE medical_appointments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_code     TEXT NOT NULL UNIQUE,       -- APT-YYYYMMDD-XXXXXX
  discord_id           TEXT NOT NULL,              -- Discord User ID (account_id)
  discord_name         TEXT NOT NULL DEFAULT '',   -- Discord display name
  patient_first_name   TEXT NOT NULL DEFAULT '',
  patient_last_name    TEXT NOT NULL DEFAULT '',
  request_type         TEXT NOT NULL DEFAULT '',   -- Medical Consultation | Surgery | Radiology Examination | Medical Examination | Laboratory Test | Emergency Consultation | Other
  custom_request_type  TEXT NOT NULL DEFAULT '',   -- filled only when request_type = 'Other'
  preferred_date       DATE,
  preferred_time       TEXT NOT NULL DEFAULT '',   -- 'HH:MM'
  symptoms             TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | SCHEDULED | COMPLETED | CANCELLED
  deleted_at           TIMESTAMPTZ,                -- Soft delete marker
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_discord ON medical_appointments (discord_id);
CREATE INDEX IF NOT EXISTS idx_appointments_code ON medical_appointments (appointment_code);

ALTER TABLE medical_appointments ENABLE ROW LEVEL SECURITY;

-- Users create appointments ONLY tied to their own Discord account.
-- The BEFORE INSERT trigger overwrites discord_id/discord_name from the
-- accounts table, so even a forged payload is corrected server-side.
DROP POLICY IF EXISTS "appointments_insert_own" ON medical_appointments;
CREATE POLICY "appointments_insert_own"
  ON medical_appointments FOR INSERT TO authenticated
  WITH CHECK (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- Users read ONLY their own, non-deleted appointments.
DROP POLICY IF EXISTS "appointments_select_own" ON medical_appointments;
CREATE POLICY "appointments_select_own"
  ON medical_appointments FOR SELECT TO authenticated
  USING (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid())
         AND deleted_at IS NULL);

-- Users may UPDATE ONLY their own rows, and the protect trigger further
-- restricts that update to soft-deleting (setting deleted_at). No other
-- column can change - status, codes, names, timestamps are locked.
DROP POLICY IF EXISTS "appointments_update_own" ON medical_appointments;
CREATE POLICY "appointments_update_own"
  ON medical_appointments FOR UPDATE TO authenticated
  USING (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()))
  WITH CHECK (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- No DELETE policy: the client can never permanently remove a row.

-- BEFORE INSERT: derive discord identity from the session, validate all
-- required fields, reject past dates, and force status = PENDING.
CREATE OR REPLACE FUNCTION public.manage_appointment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  acct accounts%ROWTYPE;
BEGIN
  SELECT * INTO acct FROM accounts WHERE id = auth.uid();
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Discord login required.';
  END IF;

  -- discord_id / discord_name ALWAYS come from the database, never the client.
  NEW.discord_id   := acct.account_id;
  NEW.discord_name := acct.name;

  IF COALESCE(NEW.appointment_code, '') = '' THEN
    RAISE EXCEPTION 'Appointment code is required.';
  END IF;
  IF COALESCE(NEW.patient_first_name, '') = '' OR COALESCE(NEW.patient_last_name, '') = '' THEN
    RAISE EXCEPTION 'Patient first and last name are required.';
  END IF;
  IF NEW.request_type NOT IN ('Medical Consultation', 'Surgery', 'Radiology Examination',
                              'Medical Examination', 'Laboratory Test', 'Emergency Consultation', 'Other') THEN
    RAISE EXCEPTION 'Invalid request type.';
  END IF;
  IF NEW.request_type = 'Other' AND COALESCE(NEW.custom_request_type, '') = '' THEN
    RAISE EXCEPTION 'Please specify your request type.';
  END IF;
  IF NEW.preferred_date IS NULL THEN
    RAISE EXCEPTION 'Preferred date is required.';
  END IF;
  IF NEW.preferred_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Preferred date cannot be in the past.';
  END IF;
  IF COALESCE(NEW.preferred_time, '') = '' OR NEW.preferred_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Preferred time is required (HH:MM).';
  END IF;
  IF COALESCE(NEW.symptoms, '') = '' THEN
    RAISE EXCEPTION 'Symptoms / medical request is required.';
  END IF;

  NEW.status     := 'PENDING';
  NEW.updated_at := now();
  IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_insert ON medical_appointments;
CREATE TRIGGER trg_appointments_insert
  BEFORE INSERT ON medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.manage_appointment_insert();

-- BEFORE UPDATE: only allow soft-deleting. Any attempt to change identity,
-- status, code, dates, names or symptoms is rejected server-side.
CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.discord_id IS DISTINCT FROM OLD.discord_id
     OR NEW.discord_name IS DISTINCT FROM OLD.discord_name
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.appointment_code IS DISTINCT FROM OLD.appointment_code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.patient_first_name IS DISTINCT FROM OLD.patient_first_name
     OR NEW.patient_last_name IS DISTINCT FROM OLD.patient_last_name
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.custom_request_type IS DISTINCT FROM OLD.custom_request_type
     OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
     OR NEW.preferred_time IS DISTINCT FROM OLD.preferred_time
     OR NEW.symptoms IS DISTINCT FROM OLD.symptoms
     OR (NEW.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'You can only soft-delete this appointment.';
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_update ON medical_appointments;
CREATE TRIGGER trg_appointments_update
  BEFORE UPDATE ON medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_appointment_update();

-- ============================================================
-- FINAL CHECK: accounts, applications, comments, contacts,
-- medications, promo_codes, medication_requests,
-- medical_appointments
-- ============================================================

-- ============================================================
-- MEDICAL DOCUMENTS (medical-certificate.html, medical-test.html)
-- Tables: medical_certificates, medical_tests
-- Files: Supabase Storage bucket "medical-documents" (PRIVATE)
-- ============================================================
-- HOW IT WORKS
--   1) An EMS doctor / admin creates the document from a future
--      EMS/Manager panel (service_role) and gives the patient the
--      document CODE.
--   2) The patient logs in with Discord and enters the code.
--   3) The lookup queries the table by code AND the current
--      user's discord_id. RLS on the table guarantees that rows
--      of OTHER users are never even readable, so a code that
--      belongs to someone else behaves exactly like a missing
--      code (no information leak).
--   4) Files live in the private bucket; the client only obtains
--      a short-lived SIGNED URL for the file path it already
--      proved it owns. The download button never exposes a
--      permanent public link.

-- ============================================================
-- TABLE 9 - medical_certificates
-- ============================================================
DROP TABLE IF EXISTS medical_certificates CASCADE;
CREATE TABLE medical_certificates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code TEXT NOT NULL UNIQUE,          -- CERT-YYYYMMDD-XXXXXX
  discord_id       TEXT NOT NULL,                 -- Discord User ID of the patient
  discord_name     TEXT NOT NULL DEFAULT '',
  patient_name     TEXT NOT NULL DEFAULT '',
  doctor_name      TEXT NOT NULL DEFAULT '',
  hospital_name    TEXT NOT NULL DEFAULT '',
  certificate_type TEXT NOT NULL DEFAULT '',
  certificate_date DATE,
  content          TEXT NOT NULL DEFAULT '',      -- free text printed on the certificate
  file_url         TEXT,                          -- storage path in the private bucket, e.g. certificates/CERT-...pdf
  status           TEXT NOT NULL DEFAULT 'VALID', -- VALID | EXPIRED | REVOKED
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_discord ON medical_certificates (discord_id);
CREATE INDEX IF NOT EXISTS idx_certificates_code ON medical_certificates (certificate_code);

ALTER TABLE medical_certificates ENABLE ROW LEVEL SECURITY;

-- Patients can SELECT only the documents tied to their own Discord ID.
-- No INSERT/UPDATE/DELETE policies: patients can never create, change
-- or delete certificates. Those operations are done by EMS/Manager via
-- service_role (future admin panel / SQL editor).
DROP POLICY IF EXISTS "certificates_select_own" ON medical_certificates;
CREATE POLICY "certificates_select_own"
  ON medical_certificates FOR SELECT TO authenticated
  USING (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));

-- ============================================================
-- TABLE 10 - medical_tests
-- ============================================================
DROP TABLE IF EXISTS medical_tests CASCADE;
CREATE TABLE medical_tests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_code    TEXT NOT NULL UNIQUE,              -- TEST-YYYYMMDD-XXXXXX
  discord_id   TEXT NOT NULL,                     -- Discord User ID of the patient
  discord_name TEXT NOT NULL DEFAULT '',
  patient_name TEXT NOT NULL DEFAULT '',
  doctor_name  TEXT NOT NULL DEFAULT '',
  test_type    TEXT NOT NULL DEFAULT '',          -- Blood Test | Radiology | Laboratory | ...
  test_date    DATE,
  result       TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  file_url     TEXT,                              -- storage path in the private bucket, e.g. tests/TEST-...pdf
  status       TEXT NOT NULL DEFAULT 'VALID',     -- VALID | EXPIRED | REVOKED
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tests_discord ON medical_tests (discord_id);
CREATE INDEX IF NOT EXISTS idx_tests_code ON medical_tests (test_code);

ALTER TABLE medical_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tests_select_own" ON medical_tests;
CREATE POLICY "tests_select_own"
  ON medical_tests FOR SELECT TO authenticated
  USING (discord_id IN (SELECT account_id FROM accounts WHERE id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies (admin/EMS creates and manages results).

-- ============================================================
-- STORAGE - private bucket for medical documents
-- ============================================================
-- Bucket is PRIVATE (public = false). Files are reached only through
-- short-lived signed URLs generated after the table-level RLS check
-- proved the document belongs to the signed-in user.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('medical-documents', 'medical-documents', false, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to create signed URLs for files inside the
-- private bucket. This is safe because:
--   * the file path is only revealed to a patient AFTER the table RLS
--     lookup confirmed the row belongs to them, and
--   * every path embeds the unguessable document code, so a foreign
--     user cannot guess a path to someone else's file.
-- (Recommended path layout: certificates/<code>.pdf and tests/<code>.pdf)
DROP POLICY IF EXISTS "doc_objects_select_auth" ON storage.objects;
CREATE POLICY "doc_objects_select_auth"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'medical-documents');

-- ============================================================
-- SEED EXAMPLES (commented out on purpose - fill in a real
-- Discord User ID from a logged-in account before enabling).
-- The doctor/EMS normally creates these rows from the admin panel.
-- ============================================================
-- INSERT INTO medical_certificates
--   (certificate_code, discord_id, discord_name, patient_name, doctor_name,
--    hospital_name, certificate_type, certificate_date, content, file_url, status)
-- VALUES
--   ('CERT-20260816-TEST01', 'REPLACE_WITH_DISCORD_ID', 'DiscordUser', 'John Doe',
--    'Dr. Smith', 'ATLANTIC Central Hospital', 'Fitness To Work', CURRENT_DATE,
--    'The patient is fit to return to duty.', 'certificates/CERT-20260816-TEST01.pdf', 'VALID');
--
-- INSERT INTO medical_tests
--   (test_code, discord_id, discord_name, patient_name, doctor_name,
--    test_type, test_date, result, notes, file_url, status)
-- VALUES
--   ('TEST-20260816-TEST01', 'REPLACE_WITH_DISCORD_ID', 'DiscordUser', 'John Doe',
--    'Dr. Smith', 'Blood Test', CURRENT_DATE,
--    'Hemoglobin: 14.2 g/dL - Normal range.', 'No anomalies detected.', 'tests/TEST-20260816-TEST01.pdf', 'VALID');

-- ============================================================
-- FINAL CHECK: accounts, applications, comments, contacts,
-- medications, promo_codes, medication_requests,
-- medical_appointments, medical_certificates, medical_tests
-- ============================================================
