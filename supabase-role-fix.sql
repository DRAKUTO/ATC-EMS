-- ============================================================
-- SUPABASE ROLE POLICY FIX  (public.accounts)
-- ------------------------------------------------------------
-- PROBLEM: the old trigger reverted `role` to OLD.role for every
--          caller except the service_role key, so even the
--          Supabase Dashboard could not set a role manually.
--
-- THIS MIGRATION (safe to re-run, deletes NO data):
--   1. Replaces force_account_role_rules() with the corrected
--      version:
--        * INSERT  (first Discord login)  -> role = 'user'
--        * Login / session refresh        -> role NEVER touched
--        * Authenticated non-Manager      -> role + ban frozen
--        * Manager (Management panel)     -> role change allowed
--        * SQL editor / Dashboard (auth.uid() IS NULL) -> allowed
--        * service_role key               -> allowed
--        * the last Manager can never be demoted (any path)
--   2. Adds a CHECK constraint:
--        role IN ('user','EMS','Manager')
--
-- APPLY AFTER: supabase-schema.sql + supabase-roles.sql
-- ============================================================


-- ------------------------------------------------------------
-- (1) Role rules trigger (corrected)
-- ------------------------------------------------------------
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
    -- New Discord account: role is ALWAYS 'user', never banned.
    NEW.role      := 'user';
    NEW.is_banned := false;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Admin paths that MAY change role:
    --   * SQL editor / Supabase Dashboard  (auth.uid() IS NULL)
    --   * app Manager via Management panel (authorize('Manager'))
    -- Every other authenticated session (login/session refresh)
    -- is FROZEN: role and ban flags cannot be modified.
    IF (auth.uid() IS NOT NULL AND NOT public.authorize('Manager')) THEN
      NEW.role       := OLD.role;
      NEW.is_banned  := OLD.is_banned;
      NEW.banned_at  := OLD.banned_at;
      NEW.banned_by  := OLD.banned_by;
      NEW.ban_reason := OLD.ban_reason;
    END IF;

    -- The last remaining Manager can never be demoted.
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

-- Recreate the trigger on the corrected function (idempotent).
DROP TRIGGER IF EXISTS trg_accounts_role_rules ON public.accounts;
CREATE TRIGGER trg_accounts_role_rules
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.force_account_role_rules();


-- ------------------------------------------------------------
-- (2) Allowed values: only user | EMS | Manager
--     Wrapped so this script never aborts even if an existing
--     row already contains an out-of-range role.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'accounts_role_check'
               AND conrelid = 'public.accounts'::regclass) THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_role_check
      CHECK (role IN ('user','EMS','Manager'));
    RAISE NOTICE 'Constraint accounts_role_check added.';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'accounts_role_check NOT added: an existing role is outside (user, EMS, Manager).';
  END;
END;
$$;


-- ------------------------------------------------------------
-- (3) Verification (run manually after applying)
-- ------------------------------------------------------------
-- 1) Trigger is active:
--    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_accounts_role_rules';
--
-- 2) Current role distribution:
--    SELECT role, count(*) FROM public.accounts GROUP BY role ORDER BY role;
--
-- 3) Manual role change via Supabase Dashboard (SQL editor):
--    UPDATE public.accounts SET role = 'EMS'    WHERE account_id = '<discord_id>';
--    UPDATE public.accounts SET role = 'Manager' WHERE account_id = '<discord_id>';
--    UPDATE public.accounts SET role = 'user'    WHERE account_id = '<discord_id>';
--
-- 4) In the app: Management -> Roles tab -> change a role
--    (only a Manager account can do this; it goes through the
--     set_account_role RPC which re-checks the caller's role).
-- ============================================================
