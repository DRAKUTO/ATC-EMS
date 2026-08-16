-- ============================================================================
-- SUPABASE PERMISSIONS & MANAGEMENT FIX
-- Project: ATLANTIC ROLEPLAY EMS
-- Target : public.accounts + related functions/policies
-- ----------------------------------------------------------------------------
-- ROLE MODEL
--   user    - default for every NEW Discord account (and only that).
--   EMS     - assigned ONLY by a Manager (Management panel) or from the
--             Supabase Dashboard (SQL editor / service_role key).
--   Manager - assigned only through an administrative path.
--
-- RULES ENFORCED HERE (all at the DATABASE level, not in the UI):
--   * New account (Discord login)          -> role = 'user'
--   * Login / session refresh              -> role is NEVER modified
--   * Authenticated non-Manager            -> role, account_id, ban frozen
--   * Manager via Management panel         -> role change allowed
--   * SQL editor / Dashboard               -> role change allowed
--   * service_role key                     -> full admin
--   * The last remaining Manager can never be demoted or deleted
--   * Only a Manager can read ALL accounts (users/EMS cannot)
--
-- DELETION MODEL (decision): HARD DELETE of the accounts row.
--   Reason: there are NO foreign-key constraints in the schema (verified),
--   and all history tables store snapshots (discord_id / discord_name), so
--   removing an account row breaks nothing. Bans/removals of access without
--   removing the row are handled by the ban_* RPCs instead.
--
-- SAFE TO RE-RUN. Deletes NO data.
-- APPLY AFTER: supabase-schema.sql + supabase-roles.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) AUTHORIZATION HELPERS (guarantee the deployed versions match)
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- (2) ROLE RULES TRIGGER (corrected)
-- ----------------------------------------------------------------------------
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

    -- The last remaining Manager can never be demoted (from ANY path,
    -- including the SQL editor).
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


-- ----------------------------------------------------------------------------
-- (3) ALLOWED ROLE VALUES ONLY
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- (4) ACCOUNTS RLS POLICIES (idempotent)
--     user / EMS can only read & edit their OWN row.
--     Only a Manager can read ALL accounts.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "accounts_insert_own" ON public.accounts;
CREATE POLICY "accounts_insert_own"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
CREATE POLICY "accounts_select_own"
  ON public.accounts FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "accounts_update_own" ON public.accounts;
CREATE POLICY "accounts_update_own"
  ON public.accounts FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- All-accounts read: MANAGER ONLY. (EMS has no management access.)
DROP POLICY IF EXISTS "accounts_select_staff" ON public.accounts;
DROP POLICY IF EXISTS "accounts_select_manager" ON public.accounts;
CREATE POLICY "accounts_select_manager"
  ON public.accounts FOR SELECT TO authenticated
  USING (public.authorize('Manager'));


-- ----------------------------------------------------------------------------
-- (5) ROLE RPC (Manager only, DB-enforced)
--     Allows: user<->EMS, user<->Manager, EMS<->Manager.
--     Blocks: the last remaining Manager.
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- (6) BAN RPC (Manager only)
--     Saves is_banned + banned_at + banned_by + ban_reason.
--     Managers cannot be banned.
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- (7) UNBAN RPC (Manager only)
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- (8) DELETE RPC (Manager only) — HARD DELETE (decision documented above).
--     Blocks: self-deletion, and deleting the last remaining Manager.
-- ----------------------------------------------------------------------------
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


-- ============================================================================
-- VERIFICATION (run manually after applying)
-- ============================================================================
-- 1) Trigger active:
--    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_accounts_role_rules';
--
-- 2) Policies:
--    SELECT policyname, cmd, qual, with_check FROM pg_policies
--     WHERE tablename = 'accounts' ORDER BY policyname;
--    (Expect: accounts_insert_own, accounts_select_own, accounts_update_own,
--     accounts_select_manager)
--
-- 3) Role distribution:
--    SELECT role, count(*) FROM public.accounts GROUP BY role ORDER BY role;
--
-- 4) Demo role change from the Dashboard (SQL editor):
--    UPDATE public.accounts SET role = 'EMS'     WHERE account_id = '<discord_id>';
--    UPDATE public.accounts SET role = 'Manager' WHERE account_id = '<discord_id>';
--    UPDATE public.accounts SET role = 'user'    WHERE account_id = '<discord_id>';
--    (the last Manager cannot be demoted/deleted)
--
-- 5) Login must never change the role: log in via Discord, then re-run (3).
-- ============================================================================
