-- ============================================================
-- SUPABASE MANAGER-PROTECTION FIX  (public.accounts)
-- ------------------------------------------------------------
-- WHAT THIS FIXES
--   force_account_role_rules() is the BEFORE-trigger that guards
--   role changes on accounts. Depending on which version is
--   currently applied, one or both of these problems exist:
--
--   1) Old versions froze role for EVERY authenticated session,
--      including Managers (`IF auth.uid() IS NOT NULL THEN
--      NEW.role := OLD.role;`). Result: a Manager could not change
--      any role through the Management panel even when another
--      Manager existed.
--
--   2) The last-Manager guard counted `role = 'Manager'` including
--      the row being demoted. Correct for single-row changes, but
--      the intended semantic is: "is there ANOTHER Manager left?".
--
-- REQUIRED BEHAVIOUR (all enforced at the database level):
--   * 1 Manager only            -> demote to EMS/user is REJECTED.
--   * 2+ Managers               -> any Manager may be demoted to
--                                    EMS or user; Manager->Manager
--                                    is always allowed.
--   * user -> EMS / user -> Manager / EMS -> user / EMS -> Manager
--     -> allowed ONLY from Supabase (SQL editor, auth.uid() NULL)
--        or from the app via a Manager (Management panel).
--   * A plain signed-in non-Manager session is FROZEN: its role and
--     ban flags can never be modified by that session.
--   * The database can never lose its last Manager through the
--     normal (single-row) path.
--
-- SAFETY
--   * No trigger is disabled.
--   * No data is deleted.
--   * No RLS policy is changed.
--   * Safe to re-run (idempotent).
--
-- APPLY: sections (1) + (2) + (3) in the Supabase SQL editor.
--        Section (5) is a SELF TEST wrapped in BEGIN...ROLLBACK —
--        it never writes anything permanently.
-- ============================================================


-- ============================================================
-- (1) CORRECTED ROLE-RULES TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.force_account_role_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  other_managers integer;
BEGIN
  -- service_role key: full admin, bypass every rule.
  IF (auth.role() = 'service_role') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    -- App first-login (authenticated session): role is ALWAYS 'user'
    -- and never banned. SQL editor / Dashboard inserts (auth.uid()
    -- IS NULL) are admin actions and may set any role.
    IF (auth.uid() IS NOT NULL) THEN
      NEW.role      := 'user';
      NEW.is_banned := false;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Who may change role / ban?
    --   * SQL editor / Supabase Dashboard  (auth.uid() IS NULL)
    --   * app Manager via Management panel (authorize('Manager'))
    -- Every OTHER authenticated session is FROZEN: role, account_id
    -- and ban flags are restored to their previous values.
    IF (auth.uid() IS NOT NULL AND NOT public.authorize('Manager')) THEN
      NEW.role        := OLD.role;
      NEW.account_id  := OLD.account_id;
      NEW.is_banned   := OLD.is_banned;
      NEW.banned_at   := OLD.banned_at;
      NEW.banned_by   := OLD.banned_by;
      NEW.ban_reason  := OLD.ban_reason;
    END IF;

    -- Last-Manager guard.
    --   Manager -> Manager   : never a demotion, always allowed.
    --   Manager -> EMS/user  : allowed ONLY if another Manager still
    --                          exists BEFORE this change is applied.
    --   The count EXCLUDES the row being demoted (it is not "another"
    --   remaining Manager). If zero others exist this would remove the
    --   last Manager, so the change is rejected.
    IF OLD.role = 'Manager' AND NEW.role IS DISTINCT FROM 'Manager' THEN
      SELECT count(*) INTO other_managers
        FROM public.accounts
       WHERE role = 'Manager'
         AND id <> OLD.id;
      IF other_managers = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last remaining Manager.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- (2) RECREATE THE TRIGGER (idempotent)
-- ============================================================
DROP TRIGGER IF EXISTS trg_accounts_role_rules ON public.accounts;
CREATE TRIGGER trg_accounts_role_rules
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.force_account_role_rules();


-- ============================================================
-- (3) ALIGN set_account_role() WITH THE SAME GUARD
--     (Management panel path). Pre-check counts OTHER Managers
--     (excluding the target) so the RPC and the trigger agree.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_account_role(account_id text, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me record; target public.accounts%ROWTYPE; other_managers integer;
BEGIN
  SELECT * INTO me FROM public.staff_ctx();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Login required.'; END IF;
  IF me.is_banned THEN RAISE EXCEPTION 'Your account has been suspended.'; END IF;
  IF me.role <> 'Manager' THEN RAISE EXCEPTION 'Only a Manager can change roles.'; END IF;
  IF new_role NOT IN ('user','EMS','Manager') THEN RAISE EXCEPTION 'Invalid role.'; END IF;

  SELECT * INTO target FROM public.accounts WHERE public.accounts.account_id = set_account_role.account_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Account not found.'; END IF;

  IF target.role = 'Manager' AND new_role <> 'Manager' THEN
    SELECT count(*) INTO other_managers
      FROM public.accounts
     WHERE role = 'Manager'
       AND id <> target.id;
    IF other_managers = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last remaining Manager.';
    END IF;
  END IF;

  UPDATE public.accounts SET role = new_role WHERE public.accounts.account_id = set_account_role.account_id;
  PERFORM public.log_activity(me.account_id, me.name, 'accounts', target.id, NULL, 'role', target.account_id || ' -> ' || new_role);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_account_role(text, text) TO authenticated;


-- ============================================================
-- (4) OPTIONAL HARDENING (NOT APPLIED BY DEFAULT)
-- ------------------------------------------------------------
-- The row-level guard above fully covers the normal path (one
-- account changed at a time, which is the only way the app and the
-- Management panel operate). The edge it cannot see is a single
-- multi-row statement such as:
--     UPDATE accounts SET role='EMS' WHERE role='Manager';
-- which could remove every Manager in ONE statement.
--
-- If you want that blocked too, uncomment the statement-level
-- AFTER trigger below. WARNING: on a fresh database with ZERO
-- Managers it also rejects the first non-Manager UPDATE/DELETE, so
-- only enable it once at least one Manager exists.
--
-- CREATE OR REPLACE FUNCTION public.enforce_at_least_one_manager()
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- AS $$
-- DECLARE total integer;
-- BEGIN
--   IF (auth.role() = 'service_role') THEN
--     RETURN NULL;
--   END IF;
--   IF TG_OP IN ('UPDATE','DELETE') THEN
--     SELECT count(*) INTO total FROM public.accounts WHERE role = 'Manager';
--     IF total = 0 THEN
--       RAISE EXCEPTION 'Cannot demote the last remaining Manager.';
--     END IF;
--   END IF;
--   RETURN NULL;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_accounts_never_zero_managers ON public.accounts;
-- CREATE TRIGGER trg_accounts_never_zero_managers
--   AFTER INSERT OR UPDATE OR DELETE ON public.accounts
--   FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_at_least_one_manager();


-- ============================================================
-- (5) SELF TEST — SAFE (BEGIN ... ROLLBACK, writes nothing)
-- ------------------------------------------------------------
-- Runs every case against the REAL database but inside a
-- transaction that is rolled back at the end. Temporary accounts
-- TST-MGR-A/B, TST-EMS-X, TST-USR-Y are created and removed.
-- Sessions are emulated with request.jwt.claims:
--   SQL editor  -> claims WITHOUT sub   (auth.uid() = NULL = admin)
--   app Manager -> sub = TST-MGR-A id   (authorize('Manager') = true)
--   plain user  -> sub = TST-USR-Y id   (freeze applies)
--
-- IMPORTANT: every case RESETS the temp accounts to their baseline
-- first, so each case is independent. Case 1 can only be validated
-- when the table contains EXACTLY ONE Manager and reports SKIP
-- otherwise (see section 6).
-- ============================================================
BEGIN;

CREATE TEMP TABLE _rt (
  case_name text,
  expected  text,
  actual    text,
  ok        boolean
);

-- Temp accounts (SQL editor runs as admin: auth.uid() IS NULL, so the
-- INSERT branch keeps the roles exactly as given).
INSERT INTO public.accounts (id, account_id, name, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'TST-MGR-A', 'Test Mgr A', 'Manager'),
  ('00000000-0000-0000-0000-0000000000a2', 'TST-MGR-B', 'Test Mgr B', 'Manager'),
  ('00000000-0000-0000-0000-0000000000a3', 'TST-EMS-X', 'Test EMS X', 'EMS'),
  ('00000000-0000-0000-0000-0000000000a4', 'TST-USR-Y', 'Test User Y', 'user');

-- 1. Only Manager A -> A to EMS must be REJECTED.
DO $$
DECLARE mcount integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO mcount FROM public.accounts WHERE role = 'Manager';
  IF mcount <> 1 THEN
    INSERT INTO _rt VALUES ('1. only Mgr A -> A->EMS', 'REJECT', 'SKIP (' || mcount || ' Managers exist, need exactly 1)', NULL);
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'EMS' WHERE account_id = 'TST-MGR-A';
    msg := 'ALLOWED (unexpected)';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  INSERT INTO _rt VALUES ('1. only Mgr A -> A->EMS', 'REJECT', msg, NOT ok AND msg LIKE '%Cannot demote the last remaining Manager.%');
END $$;

-- 2. A+B -> A to EMS must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-B';
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'EMS' WHERE account_id = 'TST-MGR-A';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-MGR-A';
  INSERT INTO _rt VALUES ('2. A+B -> A->EMS', 'ALLOW', msg, ok AND after = 'EMS');
END $$;

-- 3. A+B -> A to user must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-B';
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'user' WHERE account_id = 'TST-MGR-A';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-MGR-A';
  INSERT INTO _rt VALUES ('3. A+B -> A->user', 'ALLOW', msg, ok AND after = 'user');
END $$;

-- 4. A+B -> B to EMS must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-B';
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'EMS' WHERE account_id = 'TST-MGR-B';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-MGR-B';
  INSERT INTO _rt VALUES ('4. A+B -> B->EMS', 'ALLOW', msg, ok AND after = 'EMS');
END $$;

-- 5. EMS -> Manager, performed by a Manager session, must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'EMS'     WHERE account_id = 'TST-EMS-X';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-EMS-X';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-EMS-X';
  INSERT INTO _rt VALUES ('5. EMS->Manager by Mgr', 'ALLOW', msg, ok AND after = 'Manager');
END $$;

-- 6. user -> EMS, performed by a Manager session, must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'user'    WHERE account_id = 'TST-USR-Y';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'EMS' WHERE account_id = 'TST-USR-Y';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-USR-Y';
  INSERT INTO _rt VALUES ('6. user->EMS by Mgr', 'ALLOW', msg, ok AND after = 'EMS');
END $$;

-- 7. user -> Manager, performed by a Manager session, must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'user'    WHERE account_id = 'TST-USR-Y';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-USR-Y';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-USR-Y';
  INSERT INTO _rt VALUES ('7. user->Manager by Mgr', 'ALLOW', msg, ok AND after = 'Manager');
END $$;

-- 8. A+B -> B stays Manager (Manager -> Manager) must SUCCEED.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-A';
  UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-B';
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'Manager' WHERE account_id = 'TST-MGR-B';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-MGR-B';
  INSERT INTO _rt VALUES ('8. A+B -> B->Manager', 'ALLOW', msg, ok AND after = 'Manager');
END $$;

-- 9. Plain user session must NOT be able to promote itself.
DO $$
DECLARE after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'user' WHERE account_id = 'TST-USR-Y';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
  UPDATE public.accounts SET role = 'EMS' WHERE account_id = 'TST-USR-Y';
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-USR-Y';
  INSERT INTO _rt VALUES ('9. user->EMS by plain user', 'FROZEN (stays user)', 'stays ' || after, after = 'user');
END $$;

-- 10. SQL editor (admin path) may promote user -> EMS.
DO $$
DECLARE ok boolean; msg text; after text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  UPDATE public.accounts SET role = 'user' WHERE account_id = 'TST-USR-Y';
  ok := true;
  BEGIN
    UPDATE public.accounts SET role = 'EMS' WHERE account_id = 'TST-USR-Y';
    msg := 'ALLOW';
  EXCEPTION WHEN OTHERS THEN
    ok := false; msg := SQLERRM;
  END;
  SELECT role INTO after FROM public.accounts WHERE account_id = 'TST-USR-Y';
  INSERT INTO _rt VALUES ('10. user->EMS via Supabase', 'ALLOW', msg, ok AND after = 'EMS');
END $$;

-- Results
SELECT case_name, expected, actual,
       CASE WHEN ok IS NULL THEN '—' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM _rt;

-- Undo everything (temp accounts, role changes, temp table, claims).
ROLLBACK;


-- ============================================================
-- (6) MANUAL CHECK FOR CASE 1
-- ------------------------------------------------------------
-- Case 1 needs a table with EXACTLY ONE Manager. If your real
-- database currently has exactly one Manager, this must FAIL with
-- the error below:
--
--   UPDATE public.accounts
--      SET role = 'EMS'
--    WHERE account_id = '<account_id_of_the_only_manager>';
--
--   Expected error:  Cannot demote the last remaining Manager.
--
-- If it ALLOWS the change, the migration was not applied or the
-- trigger is not active (verify with:
--   SELECT tgname FROM pg_trigger
--    WHERE tgname = 'trg_accounts_role_rules'
--      AND tgrelid = 'public.accounts'::regclass; )
-- ============================================================
