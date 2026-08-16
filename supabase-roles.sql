-- ============================================================
-- ATLANTIC ROLEPLAY EMS — ROLES, PERMISSIONS & STAFF SYSTEM
-- Supabase SQL Editor:  https://supabase.com/dashboard/project/tumrzwermkicjuvzlisi/sql/new
--
-- Apply AFTER supabase-schema.sql. Safe to re-run (idempotent):
--   * CREATE OR REPLACE for functions
--   * ADD COLUMN IF NOT EXISTS
--   * DROP POLICY IF EXISTS before re-creating policies
--
-- ROLES (stored ONLY in accounts.role, source of truth = DB):
--   user | EMS | Manager     (default for new accounts = user)
--
-- SECURITY MODEL
--   * No frontend can change roles. The old trigger forced
--     role = 'user' / kept OLD.role for non-service_role callers;
--     it is EXTENDED so that a Manager (checked by the DB via
--     public.authorize('Manager')) may change roles. Last-Manager
--     removal is blocked in BOTH the trigger and the RPC.
--   * All privileged write operations (take request, change status,
--     change role, ban, approve/reject CV, delete contact/comment,
--     settings) run through SECURITY DEFINER RPC functions that
--     re-check the caller's real role from the accounts table with
--     auth.uid(). They bypass RLS only because they re-verify.
--   * Data reads use RLS: patients see their own rows, staff see
--     everything, Manager everything.
--   * Ban: is_banned flag on accounts. authorize() refuses banned
--     users, so a suspended account loses all staff access at the
--     database level, not just in the UI.
--
-- DOCUMENT WORKFLOW (tests & certificates)
--   * workflow_status  PENDING -> IN_PROGRESS -> READY/REJECTED
--     (+ COMPLETED, Manager only). A document is visible to the
--     patient only when workflow_status = READY.
--   * status           the patient-facing VALID / EXPIRED / REVOKED
--     state (kept from the base schema).
-- ============================================================

-- (0) ACCOUNTS — BAN COLUMNS (must exist BEFORE the authorize()
-- helpers below, because SQL-language functions are validated at
-- creation time and authorize() reads is_banned).
-- ============================================================
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by  text,   -- Discord account_id of the Manager
  ADD COLUMN IF NOT EXISTS ban_reason text;

-- ============================================================
-- (1) AUTHORIZATION HELPERS -------------------------------------------
-- authorize('Manager') / authorize('EMS'): true only when the signed-in
-- user has that role in accounts AND is not banned.
CREATE OR REPLACE FUNCTION public.authorize(required text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = auth.uid()
      AND a.role = required
      AND a.is_banned IS NOT TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.authorize(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.authorize_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.authorize('EMS') OR public.authorize('Manager');
$$;

GRANT EXECUTE ON FUNCTION public.authorize_staff() TO anon, authenticated;

-- ============================================================
-- (2) accounts — staff read policy + role trigger
-- ============================================================
-- All-accounts read: MANAGER ONLY. Users and EMS cannot read others.
DROP POLICY IF EXISTS "accounts_select_staff" ON public.accounts;
DROP POLICY IF EXISTS "accounts_select_manager" ON public.accounts;
CREATE POLICY "accounts_select_manager"
  ON public.accounts FOR SELECT TO authenticated
  USING (public.authorize('Manager'));

-- Users and EMS may only read their OWN account row.
DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
CREATE POLICY "accounts_select_own"
  ON public.accounts FOR SELECT TO authenticated
  USING (id = auth.uid());

-- EXTENDED role trigger (role-change rules):
--   * INSERT (first Discord login)      -> role forced to 'user', never banned.
--   * Login / session refresh           -> role is NEVER modified.
--   * UPDATE by authenticated non-Manager -> role + ban flags are frozen.
--   * UPDATE by a Manager (Management panel) -> role may change; demoting
--     the last remaining Manager is rejected at the database level.
--   * UPDATE via SQL editor / Dashboard (auth.uid() IS NULL) or service_role
--     key -> admin path, role may change.
CREATE OR REPLACE FUNCTION public.force_account_role_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  mcount integer;
BEGIN
  IF (auth.role() = 'service_role') THEN
    RETURN NEW;   -- service key: full admin
  END IF;
  IF (TG_OP = 'INSERT') THEN
    -- New account created by the app (Discord login, auth.uid() present):
    -- role is ALWAYS 'user', never banned. Direct SQL / Dashboard inserts
    -- (auth.uid() IS NULL) are admin actions and may set any role.
    IF (auth.uid() IS NOT NULL) THEN
      NEW.role      := 'user';
      NEW.is_banned := false;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Admin paths that MAY change role:
    --   * SQL editor / Supabase Dashboard  (auth.uid() IS NULL)
    --   * app Manager via Management panel (authorize('Manager'))
    -- Every other authenticated session (login/session refresh)
    -- is FROZEN: role, account_id and ban flags cannot be modified.
    IF (auth.uid() IS NOT NULL AND NOT public.authorize('Manager')) THEN
      NEW.role        := OLD.role;
      NEW.account_id  := OLD.account_id;
      NEW.is_banned   := OLD.is_banned;
      NEW.banned_at   := OLD.banned_at;
      NEW.banned_by   := OLD.banned_by;
      NEW.ban_reason  := OLD.ban_reason;
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

DROP TRIGGER IF EXISTS trg_accounts_role_rules ON public.accounts;
CREATE TRIGGER trg_accounts_role_rules
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.force_account_role_rules();

-- ============================================================
-- (3) staff_activities — History / audit trail (My Space -> History)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.staff_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    TEXT NOT NULL,              -- Discord account_id of the actor
  actor_name  TEXT NOT NULL DEFAULT '',
  table_name  TEXT NOT NULL DEFAULT '',
  record_id   UUID,
  record_code TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL DEFAULT '',   -- take | status | ban | role | approve | reject | create | delete | settings
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_activities_actor ON public.staff_activities (actor_id);
CREATE INDEX IF NOT EXISTS idx_staff_activities_created ON public.staff_activities (created_at);

ALTER TABLE public.staff_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_activities_select_own" ON public.staff_activities;
CREATE POLICY "staff_activities_select_own"
  ON public.staff_activities FOR SELECT TO authenticated
  USING (actor_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid())
         OR public.authorize('Manager'));
-- No INSERT/UPDATE/DELETE policies: rows are written only by the
-- SECURITY DEFINER RPC functions below.

-- Activity logger (used inside the RPC functions).
CREATE OR REPLACE FUNCTION public.log_activity(
  p_actor_id   text,
  p_actor_name text,
  p_table      text,
  p_record_id  uuid,
  p_code       text,
  p_action     text,
  p_detail     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.staff_activities
    (actor_id, actor_name, table_name, record_id, record_code, action, detail)
  VALUES
    (p_actor_id, p_actor_name, p_table, p_record_id, COALESCE(p_code, ''), p_action, COALESCE(p_detail, ''));
END;
$$;

-- Current staff context helper (actor lookup + auth).
CREATE OR REPLACE FUNCTION public.staff_ctx()
RETURNS TABLE (id uuid, account_id text, name text, role text, is_banned boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
  RETURN QUERY SELECT a.id, a.account_id, a.name, a.role, a.is_banned
               FROM public.accounts a WHERE a.id = auth.uid();
END;
$$;

-- ============================================================
-- (4) medication_requests — staff workflow columns + access
-- ============================================================
ALTER TABLE public.medication_requests
  ADD COLUMN IF NOT EXISTS assigned_doctor_id   text,
  ADD COLUMN IF NOT EXISTS assigned_doctor_name text,
  ADD COLUMN IF NOT EXISTS rejection_reason     text,
  ADD COLUMN IF NOT EXISTS rejected_by          text,
  ADD COLUMN IF NOT EXISTS rejected_at          timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by         text,
  ADD COLUMN IF NOT EXISTS completed_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_med_requests_assigned ON public.medication_requests (assigned_doctor_id);

-- Staff may read all medication requests.
DROP POLICY IF EXISTS "med_requests_select_staff" ON public.medication_requests;
CREATE POLICY "med_requests_select_staff"
  ON public.medication_requests FOR SELECT TO authenticated
  USING (public.authorize('EMS') OR public.authorize('Manager'));

-- Take a medication request (ATOMIC claim - race safe).
CREATE OR REPLACE FUNCTION public.take_med_request(request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; updated integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can take requests.'; END IF;

  UPDATE public.medication_requests
     SET assigned_doctor_id = me.account_id,
         assigned_doctor_name = me.name,
         status = 'IN_PROGRESS',
         updated_at = now()
   WHERE id = request_id
     AND assigned_doctor_id IS NULL
     AND status = 'PENDING';
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RAISE EXCEPTION 'This request is already assigned to another EMS doctor.';
  END IF;
  PERFORM public.log_activity(me.account_id, me.name, 'medication_requests', request_id, NULL, 'take', 'Request claimed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.take_med_request(uuid) TO authenticated;

-- Change medication request status (only the assigned doctor or a Manager).
CREATE OR REPLACE FUNCTION public.set_med_request_status(request_id uuid, new_status text, rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; cur public.medication_requests%ROWTYPE; st text;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can manage requests.'; END IF;

  SELECT * INTO cur FROM public.medication_requests WHERE id = request_id;
  IF cur.id IS NULL THEN RAISE EXCEPTION 'Request not found.'; END IF;

  st := upper(COALESCE(new_status, ''));
  IF st NOT IN ('PENDING','IN_PROGRESS','READY','REJECTED','COMPLETED') THEN
    RAISE EXCEPTION 'Invalid status.';
  END IF;
  IF st = 'COMPLETED' AND me.role <> 'Manager' THEN
    RAISE EXCEPTION 'Only a Manager can mark a request as COMPLETED.';
  END IF;
  IF me.role <> 'Manager' AND cur.assigned_doctor_id IS DISTINCT FROM me.account_id THEN
    RAISE EXCEPTION 'Only the assigned doctor can manage this request.';
  END IF;

  IF st = 'PENDING' THEN
    UPDATE public.medication_requests
       SET status = 'PENDING', assigned_doctor_id = NULL, assigned_doctor_name = NULL,
           completed_by = NULL, completed_at = NULL, updated_at = now()
     WHERE id = request_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medication_requests', request_id, cur.request_code, 'status', 'Returned to PENDING');
  ELSIF st = 'REJECTED' THEN
    IF COALESCE(rejection_reason, '') = '' THEN RAISE EXCEPTION 'Rejection reason is required.'; END IF;
    UPDATE public.medication_requests
       SET status = 'REJECTED', rejection_reason = set_med_request_status.rejection_reason, rejected_by = me.account_id,
           rejected_at = now(), updated_at = now()
     WHERE id = request_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medication_requests', request_id, cur.request_code, 'reject', rejection_reason);
  ELSE
    UPDATE public.medication_requests
       SET status = st, completed_by = me.account_id, completed_at = now(), updated_at = now()
     WHERE id = request_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medication_requests', request_id, cur.request_code, 'status', st);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_med_request_status(uuid, text, text) TO authenticated;

-- ============================================================
-- (5) medical_appointments — staff workflow columns + access
-- ============================================================
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS assigned_doctor_id   text,
  ADD COLUMN IF NOT EXISTS assigned_doctor_name text,
  ADD COLUMN IF NOT EXISTS rejection_reason     text,
  ADD COLUMN IF NOT EXISTS rejected_by          text,
  ADD COLUMN IF NOT EXISTS rejected_at          timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by         text,
  ADD COLUMN IF NOT EXISTS completed_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_assigned ON public.medical_appointments (assigned_doctor_id);

-- Staff may read all (non-deleted) appointments.
DROP POLICY IF EXISTS "appointments_select_staff" ON public.medical_appointments;
CREATE POLICY "appointments_select_staff"
  ON public.medical_appointments FOR SELECT TO authenticated
  USING ((public.authorize('EMS') OR public.authorize('Manager')) AND deleted_at IS NULL);

-- Extended update trigger: staff may manage the request fields; patients
-- keep the soft-delete-only rule.
CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (public.authorize('EMS') OR public.authorize('Manager')) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
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

DROP TRIGGER IF EXISTS trg_appointments_update ON public.medical_appointments;
CREATE TRIGGER trg_appointments_update
  BEFORE UPDATE ON public.medical_appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_appointment_update();

CREATE OR REPLACE FUNCTION public.take_appointment(appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; updated integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can take requests.'; END IF;

  UPDATE public.medical_appointments
     SET assigned_doctor_id = me.account_id,
         assigned_doctor_name = me.name,
         status = 'IN_PROGRESS',
         updated_at = now()
   WHERE id = appointment_id
     AND assigned_doctor_id IS NULL
     AND status = 'PENDING'
     AND deleted_at IS NULL;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RAISE EXCEPTION 'This request is already assigned to another EMS doctor.';
  END IF;
  PERFORM public.log_activity(me.account_id, me.name, 'medical_appointments', appointment_id, NULL, 'take', 'Request claimed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.take_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_appointment_status(appointment_id uuid, new_status text, rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; cur public.medical_appointments%ROWTYPE; st text;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can manage requests.'; END IF;

  SELECT * INTO cur FROM public.medical_appointments WHERE id = appointment_id;
  IF cur.id IS NULL THEN RAISE EXCEPTION 'Request not found.'; END IF;

  st := upper(COALESCE(new_status, ''));
  IF st NOT IN ('PENDING','IN_PROGRESS','READY','REJECTED','COMPLETED') THEN
    RAISE EXCEPTION 'Invalid status.';
  END IF;
  IF st = 'COMPLETED' AND me.role <> 'Manager' THEN
    RAISE EXCEPTION 'Only a Manager can mark a request as COMPLETED.';
  END IF;
  IF me.role <> 'Manager' AND cur.assigned_doctor_id IS DISTINCT FROM me.account_id THEN
    RAISE EXCEPTION 'Only the assigned doctor can manage this request.';
  END IF;

  IF st = 'PENDING' THEN
    UPDATE public.medical_appointments
       SET status = 'PENDING', assigned_doctor_id = NULL, assigned_doctor_name = NULL,
           completed_by = NULL, completed_at = NULL, updated_at = now()
     WHERE id = appointment_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_appointments', appointment_id, cur.appointment_code, 'status', 'Returned to PENDING');
  ELSIF st = 'REJECTED' THEN
    IF COALESCE(rejection_reason, '') = '' THEN RAISE EXCEPTION 'Rejection reason is required.'; END IF;
    UPDATE public.medical_appointments
       SET status = 'REJECTED', rejection_reason = set_appointment_status.rejection_reason, rejected_by = me.account_id,
           rejected_at = now(), updated_at = now()
     WHERE id = appointment_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_appointments', appointment_id, cur.appointment_code, 'reject', rejection_reason);
  ELSE
    UPDATE public.medical_appointments
       SET status = st, completed_by = me.account_id, completed_at = now(), updated_at = now()
     WHERE id = appointment_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_appointments', appointment_id, cur.appointment_code, 'status', st);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, text) TO authenticated;

-- ============================================================
-- (6) medical_tests & medical_certificates — document workflow
-- ============================================================
ALTER TABLE public.medical_tests
  ADD COLUMN IF NOT EXISTS created_by_doctor_id   text,
  ADD COLUMN IF NOT EXISTS created_by_doctor_name text,
  ADD COLUMN IF NOT EXISTS assigned_doctor_id     text,
  ADD COLUMN IF NOT EXISTS assigned_doctor_name   text,
  ADD COLUMN IF NOT EXISTS rejection_reason       text,
  ADD COLUMN IF NOT EXISTS rejected_by            text,
  ADD COLUMN IF NOT EXISTS rejected_at            timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_status        text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS file_name              text NOT NULL DEFAULT '';

ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS created_by_doctor_id   text,
  ADD COLUMN IF NOT EXISTS created_by_doctor_name text,
  ADD COLUMN IF NOT EXISTS assigned_doctor_id     text,
  ADD COLUMN IF NOT EXISTS assigned_doctor_name   text,
  ADD COLUMN IF NOT EXISTS rejection_reason       text,
  ADD COLUMN IF NOT EXISTS rejected_by            text,
  ADD COLUMN IF NOT EXISTS rejected_at            timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_status        text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS file_name              text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tests_creator ON public.medical_tests (created_by_doctor_id);
CREATE INDEX IF NOT EXISTS idx_certs_creator ON public.medical_certificates (created_by_doctor_id);

-- Document insert trigger: only EMS/Manager can create documents; the
-- creator identity always comes from the session. workflow_status starts
-- PENDING (hidden from the patient until READY); the public status stays
-- 'VALID' (the patient-facing VALID/EXPIRED/REVOKED state).
CREATE OR REPLACE FUNCTION public.manage_medical_document_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL OR me.is_banned THEN
    RAISE EXCEPTION 'Login required.';
  END IF;
  IF me.role NOT IN ('EMS','Manager') THEN
    RAISE EXCEPTION 'Only EMS staff can create medical documents.';
  END IF;
  NEW.created_by_doctor_id   := me.account_id;
  NEW.created_by_doctor_name := me.name;
  NEW.doctor_name            := me.name;
  NEW.workflow_status        := 'PENDING';
  NEW.status                 := 'VALID';
  NEW.updated_at             := now();
  IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tests_insert ON public.medical_tests;
CREATE TRIGGER trg_tests_insert
  BEFORE INSERT ON public.medical_tests
  FOR EACH ROW EXECUTE FUNCTION public.manage_medical_document_insert();

DROP TRIGGER IF EXISTS trg_certificates_insert ON public.medical_certificates;
CREATE TRIGGER trg_certificates_insert
  BEFORE INSERT ON public.medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.manage_medical_document_insert();

-- ---- medical_tests RLS ----
DROP POLICY IF EXISTS "tests_select_own" ON public.medical_tests;
CREATE POLICY "tests_select_own"
  ON public.medical_tests FOR SELECT TO authenticated
  USING (discord_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tests_select_staff" ON public.medical_tests;
CREATE POLICY "tests_select_staff"
  ON public.medical_tests FOR SELECT TO authenticated
  USING (public.authorize('EMS') OR public.authorize('Manager'));

DROP POLICY IF EXISTS "tests_insert_staff" ON public.medical_tests;
CREATE POLICY "tests_insert_staff"
  ON public.medical_tests FOR INSERT TO authenticated
  WITH CHECK (public.authorize('EMS') OR public.authorize('Manager'));

-- Creator or Manager may edit / delete. Other staff: view only.
DROP POLICY IF EXISTS "tests_update_creator_manager" ON public.medical_tests;
CREATE POLICY "tests_update_creator_manager"
  ON public.medical_tests FOR UPDATE TO authenticated
  USING (public.authorize('Manager')
         OR created_by_doctor_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tests_delete_creator_manager" ON public.medical_tests;
CREATE POLICY "tests_delete_creator_manager"
  ON public.medical_tests FOR DELETE TO authenticated
  USING (public.authorize('Manager')
         OR created_by_doctor_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid()));

-- ---- medical_certificates RLS ----
DROP POLICY IF EXISTS "certificates_select_own" ON public.medical_certificates;
CREATE POLICY "certificates_select_own"
  ON public.medical_certificates FOR SELECT TO authenticated
  USING (discord_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid()));

DROP POLICY IF EXISTS "certificates_select_staff" ON public.medical_certificates;
CREATE POLICY "certificates_select_staff"
  ON public.medical_certificates FOR SELECT TO authenticated
  USING (public.authorize('EMS') OR public.authorize('Manager'));

DROP POLICY IF EXISTS "certificates_insert_staff" ON public.medical_certificates;
CREATE POLICY "certificates_insert_staff"
  ON public.medical_certificates FOR INSERT TO authenticated
  WITH CHECK (public.authorize('EMS') OR public.authorize('Manager'));

DROP POLICY IF EXISTS "certificates_update_creator_manager" ON public.medical_certificates;
CREATE POLICY "certificates_update_creator_manager"
  ON public.medical_certificates FOR UPDATE TO authenticated
  USING (public.authorize('Manager')
         OR created_by_doctor_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid()));

DROP POLICY IF EXISTS "certificates_delete_creator_manager" ON public.medical_certificates;
CREATE POLICY "certificates_delete_creator_manager"
  ON public.medical_certificates FOR DELETE TO authenticated
  USING (public.authorize('Manager')
         OR created_by_doctor_id IN (SELECT account_id FROM public.accounts WHERE id = auth.uid()));

-- Take / status RPC for tests & certificates (operates on workflow_status).
CREATE OR REPLACE FUNCTION public.take_test(test_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; updated integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can take requests.'; END IF;

  UPDATE public.medical_tests
     SET assigned_doctor_id = me.account_id, assigned_doctor_name = me.name,
         workflow_status = 'IN_PROGRESS', updated_at = now()
   WHERE id = test_id AND assigned_doctor_id IS NULL AND workflow_status = 'PENDING';
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RAISE EXCEPTION 'This request is already assigned to another EMS doctor.';
  END IF;
  PERFORM public.log_activity(me.account_id, me.name, 'medical_tests', test_id, NULL, 'take', 'Request claimed');
END;
$$;
GRANT EXECUTE ON FUNCTION public.take_test(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.take_certificate(certificate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; updated integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can take requests.'; END IF;

  UPDATE public.medical_certificates
     SET assigned_doctor_id = me.account_id, assigned_doctor_name = me.name,
         workflow_status = 'IN_PROGRESS', updated_at = now()
   WHERE id = certificate_id AND assigned_doctor_id IS NULL AND workflow_status = 'PENDING';
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RAISE EXCEPTION 'This request is already assigned to another EMS doctor.';
  END IF;
  PERFORM public.log_activity(me.account_id, me.name, 'medical_certificates', certificate_id, NULL, 'take', 'Request claimed');
END;
$$;
GRANT EXECUTE ON FUNCTION public.take_certificate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_test_status(test_id uuid, new_status text, rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; cur public.medical_tests%ROWTYPE; st text;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can manage documents.'; END IF;

  SELECT * INTO cur FROM public.medical_tests WHERE id = test_id;
  IF cur.id IS NULL THEN RAISE EXCEPTION 'Document not found.'; END IF;

  st := upper(COALESCE(new_status, ''));
  IF st NOT IN ('PENDING','IN_PROGRESS','READY','REJECTED','COMPLETED') THEN
    RAISE EXCEPTION 'Invalid status.';
  END IF;
  IF st = 'COMPLETED' AND me.role <> 'Manager' THEN
    RAISE EXCEPTION 'Only a Manager can mark a document as COMPLETED.';
  END IF;
  IF me.role <> 'Manager' AND cur.created_by_doctor_id IS DISTINCT FROM me.account_id THEN
    RAISE EXCEPTION 'Only the doctor who created this document can manage it.';
  END IF;

  IF st = 'PENDING' THEN
    UPDATE public.medical_tests
       SET workflow_status = 'PENDING', assigned_doctor_id = NULL, assigned_doctor_name = NULL, updated_at = now()
     WHERE id = test_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_tests', test_id, cur.test_code, 'status', 'Returned to PENDING');
  ELSIF st = 'REJECTED' THEN
    IF COALESCE(rejection_reason, '') = '' THEN RAISE EXCEPTION 'Rejection reason is required.'; END IF;
    UPDATE public.medical_tests
       SET workflow_status = 'REJECTED', rejection_reason = set_test_status.rejection_reason, rejected_by = me.account_id,
           rejected_at = now(), updated_at = now()
     WHERE id = test_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_tests', test_id, cur.test_code, 'reject', rejection_reason);
  ELSE
    -- READY / IN_PROGRESS / COMPLETED: publishing sets the patient-facing status.
    UPDATE public.medical_tests
       SET workflow_status = st, status = 'VALID', updated_at = now()
     WHERE id = test_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_tests', test_id, cur.test_code, 'status', st);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_test_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_certificate_status(certificate_id uuid, new_status text, rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; cur public.medical_certificates%ROWTYPE; st text;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role NOT IN ('EMS','Manager') THEN RAISE EXCEPTION 'Only EMS staff can manage documents.'; END IF;

  SELECT * INTO cur FROM public.medical_certificates WHERE id = certificate_id;
  IF cur.id IS NULL THEN RAISE EXCEPTION 'Document not found.'; END IF;

  st := upper(COALESCE(new_status, ''));
  IF st NOT IN ('PENDING','IN_PROGRESS','READY','REJECTED','COMPLETED') THEN
    RAISE EXCEPTION 'Invalid status.';
  END IF;
  IF st = 'COMPLETED' AND me.role <> 'Manager' THEN
    RAISE EXCEPTION 'Only a Manager can mark a document as COMPLETED.';
  END IF;
  IF me.role <> 'Manager' AND cur.created_by_doctor_id IS DISTINCT FROM me.account_id THEN
    RAISE EXCEPTION 'Only the doctor who created this document can manage it.';
  END IF;

  IF st = 'PENDING' THEN
    UPDATE public.medical_certificates
       SET workflow_status = 'PENDING', assigned_doctor_id = NULL, assigned_doctor_name = NULL, updated_at = now()
     WHERE id = certificate_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_certificates', certificate_id, cur.certificate_code, 'status', 'Returned to PENDING');
  ELSIF st = 'REJECTED' THEN
    IF COALESCE(rejection_reason, '') = '' THEN RAISE EXCEPTION 'Rejection reason is required.'; END IF;
    UPDATE public.medical_certificates
       SET workflow_status = 'REJECTED', rejection_reason = set_certificate_status.rejection_reason, rejected_by = me.account_id,
           rejected_at = now(), updated_at = now()
     WHERE id = certificate_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_certificates', certificate_id, cur.certificate_code, 'reject', rejection_reason);
  ELSE
    -- READY / IN_PROGRESS / COMPLETED: publishing sets the patient-facing status.
    UPDATE public.medical_certificates
       SET workflow_status = st, status = 'VALID', updated_at = now()
     WHERE id = certificate_id;
    PERFORM public.log_activity(me.account_id, me.name, 'medical_certificates', certificate_id, cur.certificate_code, 'status', st);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_certificate_status(uuid, text, text) TO authenticated;

-- ============================================================
-- (7) contacts — Manager access (view / mark read / delete)
-- ============================================================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

DROP POLICY IF EXISTS "contacts_select_manager" ON public.contacts;
CREATE POLICY "contacts_select_manager"
  ON public.contacts FOR SELECT TO authenticated
  USING (public.authorize('Manager'));

DROP POLICY IF EXISTS "contacts_update_manager" ON public.contacts;
CREATE POLICY "contacts_update_manager"
  ON public.contacts FOR UPDATE TO authenticated
  USING (public.authorize('Manager'))
  WITH CHECK (public.authorize('Manager'));

DROP POLICY IF EXISTS "contacts_delete_manager" ON public.contacts;
CREATE POLICY "contacts_delete_manager"
  ON public.contacts FOR DELETE TO authenticated
  USING (public.authorize('Manager'));

-- ============================================================
-- (8) comments — Manager can delete
-- ============================================================
DROP POLICY IF EXISTS "comments_delete_manager" ON public.comments;
CREATE POLICY "comments_delete_manager"
  ON public.comments FOR DELETE TO authenticated
  USING (public.authorize('Manager'));

-- ============================================================
-- (9) applications — Manager access + review columns
-- ============================================================
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by      text,
  ADD COLUMN IF NOT EXISTS reviewed_at      timestamptz;

DROP POLICY IF EXISTS "applications_select_manager" ON public.applications;
CREATE POLICY "applications_select_manager"
  ON public.applications FOR SELECT TO authenticated
  USING (public.authorize('Manager'));

-- Approve a joining CV (no automatic role change).
CREATE OR REPLACE FUNCTION public.approve_application(application_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can approve applications.'; END IF;

  UPDATE public.applications
     SET status = 'APPROVED', reviewed_by = me.account_id, reviewed_at = now()
   WHERE id = application_id;
  PERFORM public.log_activity(me.account_id, me.name, 'applications', application_id, NULL, 'approve', 'Application approved');
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_application(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_application(application_id uuid, rejection_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can reject applications.'; END IF;
  IF COALESCE(rejection_reason, '') = '' THEN RAISE EXCEPTION 'Rejection reason is required.'; END IF;

  UPDATE public.applications
     SET status = 'REJECTED', rejection_reason = reject_application.rejection_reason, reviewed_by = me.account_id, reviewed_at = now()
   WHERE id = application_id;
  PERFORM public.log_activity(me.account_id, me.name, 'applications', application_id, NULL, 'reject', rejection_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_application(uuid, text) TO authenticated;

-- ============================================================
-- (10) ROLE / BAN MANAGEMENT RPCs (Manager only, DB-enforced)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_account_role(account_id text, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; target public.accounts%ROWTYPE; mcount integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can change roles.'; END IF;
  IF new_role NOT IN ('user','EMS','Manager') THEN RAISE EXCEPTION 'Invalid role.'; END IF;

  SELECT * INTO target FROM public.accounts WHERE public.accounts.account_id = set_account_role.account_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Account not found.'; END IF;

  IF target.role = 'Manager' AND new_role <> 'Manager' THEN
    SELECT count(*) INTO mcount FROM public.accounts WHERE role = 'Manager';
    IF mcount <= 1 THEN RAISE EXCEPTION 'Cannot demote the last remaining Manager.'; END IF;
  END IF;

  UPDATE public.accounts SET role = new_role WHERE public.accounts.account_id = set_account_role.account_id;
  PERFORM public.log_activity(me.account_id, me.name, 'accounts', target.id, NULL, 'role', target.account_id || ' -> ' || new_role);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_account_role(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ban_account(account_id text, ban_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; target public.accounts%ROWTYPE;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can ban accounts.'; END IF;

  SELECT * INTO target FROM public.accounts WHERE public.accounts.account_id = ban_account.account_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Account not found.'; END IF;
  IF target.role = 'Manager' THEN RAISE EXCEPTION 'You cannot ban another Manager.'; END IF;

  UPDATE public.accounts
     SET is_banned = true, banned_at = now(), banned_by = me.account_id,
         ban_reason = COALESCE(ban_account.ban_reason, '')
   WHERE public.accounts.account_id = ban_account.account_id;
  PERFORM public.log_activity(me.account_id, me.name, 'accounts', target.id, NULL, 'ban', COALESCE(ban_reason, ''));
END;
$$;
GRANT EXECUTE ON FUNCTION public.ban_account(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unban_account(account_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; target public.accounts%ROWTYPE;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can unban accounts.'; END IF;

  SELECT * INTO target FROM public.accounts WHERE public.accounts.account_id = unban_account.account_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Account not found.'; END IF;

  UPDATE public.accounts
     SET is_banned = false, banned_at = NULL, banned_by = NULL, ban_reason = NULL
   WHERE public.accounts.account_id = unban_account.account_id;
  PERFORM public.log_activity(me.account_id, me.name, 'accounts', target.id, NULL, 'unban', '');
END;
$$;
GRANT EXECUTE ON FUNCTION public.unban_account(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_account(account_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; target public.accounts%ROWTYPE; mcount integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can delete accounts.'; END IF;
  IF me.account_id = account_id THEN RAISE EXCEPTION 'You cannot delete your own account.'; END IF;

  SELECT * INTO target FROM public.accounts WHERE public.accounts.account_id = delete_account.account_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Account not found.'; END IF;
  IF target.role = 'Manager' THEN
    SELECT count(*) INTO mcount FROM public.accounts WHERE role = 'Manager';
    IF mcount <= 1 THEN RAISE EXCEPTION 'Cannot delete the last remaining Manager.'; END IF;
  END IF;

  DELETE FROM public.accounts WHERE public.accounts.account_id = delete_account.account_id;
  PERFORM public.log_activity(me.account_id, me.name, 'accounts', NULL, NULL, 'delete', account_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_account(text) TO authenticated;

-- ============================================================
-- (11) CONTACT / COMMENT management RPCs (Manager only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_contact_read(contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL OR me.is_banned THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can manage contact messages.'; END IF;
  UPDATE public.contacts SET is_read = true, read_at = now() WHERE id = contact_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_contact_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_contact(contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL OR me.is_banned THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can delete contact messages.'; END IF;
  DELETE FROM public.contacts WHERE id = contact_id;
  PERFORM public.log_activity(me.account_id, me.name, 'contacts', contact_id, NULL, 'delete', '');
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_contact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_comment(comment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL OR me.is_banned THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can delete comments.'; END IF;
  DELETE FROM public.comments WHERE id = comment_id;
  PERFORM public.log_activity(me.account_id, me.name, 'comments', comment_id, NULL, 'delete', '');
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_comment(uuid) TO authenticated;

-- ============================================================
-- (12) settings (Management -> Settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_auth" ON public.settings;
CREATE POLICY "settings_select_auth"
  ON public.settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_update_manager" ON public.settings;
CREATE POLICY "settings_update_manager"
  ON public.settings FOR UPDATE TO authenticated
  USING (public.authorize('Manager'))
  WITH CHECK (public.authorize('Manager'));

CREATE OR REPLACE FUNCTION public.update_setting(setting_key text, setting_value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL OR me.is_banned THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can change settings.'; END IF;
  INSERT INTO public.settings (key, value, updated_at)
  VALUES (setting_key, setting_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  PERFORM public.log_activity(me.account_id, me.name, 'settings', NULL, NULL, 'settings', setting_key);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_setting(text, text) TO authenticated;

INSERT INTO public.settings (key, value) VALUES ('hospital_name', 'ATLANTIC Central Hospital')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- (13) STORAGE — staff upload/delete in the private documents bucket
-- ============================================================
DROP POLICY IF EXISTS "doc_objects_insert_staff" ON storage.objects;
CREATE POLICY "doc_objects_insert_staff"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical-documents'
              AND (public.authorize('EMS') OR public.authorize('Manager')));

DROP POLICY IF EXISTS "doc_objects_delete_staff" ON storage.objects;
CREATE POLICY "doc_objects_delete_staff"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'medical-documents'
         AND (public.authorize('Manager') OR owner = auth.uid()));

-- ============================================================
-- FINAL CHECKS
-- ============================================================
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
-- SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'set_%' OR proname LIKE 'take_%' ORDER BY 1;
