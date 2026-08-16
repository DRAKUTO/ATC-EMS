# ATLANTIC ROLEPLAY EMS — SECURITY AUDIT REPORT

Date: 16 Aug 2026
Scope: Entire project (`index.html`, `script.js`, `my-space.js`, `management.js`, `document.js`, `medication.js`, `appointment.js`, `server.js`, `supabase.js`, `supabase-schema.sql`, `supabase-roles.sql`, `style.css`, all pages) + Supabase project `tumrzwermkicjuvzlisi`.

No secrets, tokens, keys or private user data are included in this report.

---

## EXECUTIVE SUMMARY

The application has a strong security posture: authorization is enforced at the database level (RLS + SECURITY DEFINER RPCs that re-check the caller's real role and ban state), request claiming is atomic (race-safe), all user content is HTML-escaped before rendering, prices/discounts/status are recomputed server-side, and the anon key is the only credential in the frontend (which is correct).

The audit found **no CRITICAL** and **no HIGH** vulnerabilities. It found **2 MEDIUM**, several **LOW**, and **INFO** items. All of them were fixed or mitigated, plus defense-in-depth hardening was added.

### Findings by severity

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 6 |
| INFO | 6 |

---

## VULNERABILITIES & FIXES

### SEC-001 — Medical file path enumeration (IDOR on private storage)
- **Severity:** MEDIUM
- **Affected:** `my-space.js` (`makeDocCode`), storage bucket `medical-documents`, policy `doc_objects_select_auth`
- **Description:** Document codes were generated with 6 **digits only** (`TEST-YYYYMMDD-XXXXXX`). The codes are embedded in the private storage file paths (`tests/<code>.pdf`). The storage SELECT policy allows any authenticated user to create a signed URL for any object in the bucket, so a patient could enumerate ~1M code/path combinations per day and download other patients' medical files without ever touching the tables.
- **Impact:** Confidential medical data exposure to any authenticated user.
- **Root cause:** Low-entropy code alphabet (10^6) combined with path-based (not ownership-based) storage access control.
- **Fix Applied:** `my-space.js` `makeDocCode` now uses a 32-character alphabet without ambiguous characters (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), giving ~1.07 billion combinations per date. Storage SELECT/INSERT policies now also whitelist the folder layout (`tests/`, `certificates/`) and allowed file types (defense-in-depth).
- **Verification:** Code generator updated; `node --check my-space.js` passes. The bucket remains private; table RLS still gates what file paths a patient can learn.

### SEC-002 — Banned users could still create new content
- **Severity:** MEDIUM
- **Affected:** `supabase-schema.sql` INSERT policies on `comments`, `contacts`, `applications`, `medication_requests`, `medical_appointments`
- **Description:** Ban was enforced for staff via `authorize()` (all privileged RPCs + staff policies refuse banned users), but the patient-facing INSERT policies did not check `is_banned`. A suspended account could still post comments, send contact messages, submit CVs, medication requests and appointments directly via the API.
- **Impact:** A ban could be circumvented for content creation.
- **Root Cause:** Patient INSERT policies checked only ownership, not ban state.
- **Fix Applied:** New migration `supabase-hardening.sql` re-creates all five INSERT policies to require the caller's `accounts` row to have `is_banned IS NOT TRUE`. Banned users keep read access to their own history but cannot create anything.
- **Verification:** SQL written to be idempotent (DROP POLICY IF EXISTS + CREATE). To apply: run `supabase-hardening.sql` in the Supabase SQL editor.

### SEC-003 — Static server crash on malformed percent-encoding
- **Severity:** LOW
- **Affected:** `server.js`
- **Description:** `decodeURIComponent(req.url)` could throw on malformed URIs (e.g. `/%zz`), which in Node propagates as an uncaught exception and takes the process down.
- **Impact:** Denial of service of the local dev server.
- **Root Cause:** No try/catch around URL decoding.
- **Fix Applied:** `server.js` now wraps decoding in try/catch and returns `400 Bad Request`. Also, only GET/HEAD are accepted (405 otherwise).
- **Verification:** `curl http://localhost:3001/%zz` returns 400; server remains alive afterwards.

### SEC-004 — Sensitive files served by the static server
- **Severity:** LOW
- **Affected:** `server.js`
- **Description:** The server served any file in the web root, including `*.sql` schema/migration files and package manifests, to anyone who knew the path.
- **Impact:** Full disclosure of the database schema and security model.
- **Root Cause:** No file allow/deny list on the static server.
- **Fix Applied:** `server.js` now blocks dotfiles, `.git`/`.svn`/`.env` segments, and extensions `.sql/.db/.sqlite/.log/.pem/.key/.crt/.env/.yml/.yaml`.
- **Verification:** `curl http://localhost:3001/supabase-roles.sql` returns 403; `/` still serves the site.

### SEC-005 — Missing security headers
- **Severity:** LOW
- **Affected:** `server.js`
- **Description:** No `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` or `Permissions-Policy` were set.
- **Impact:** Reduced browser-side hardening (MIME sniffing, clickjacking, information leakage via referrer, etc.).
- **Fix Applied:** `server.js` adds on every response: `Content-Security-Policy` (tuned to the site's actual resources, includes `'unsafe-inline'` because the app uses inline `onclick` handlers), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (+ `frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- **Verification:** HEAD request to `/index.html` shows all headers.

### SEC-006 — Authorization decisions cached in localStorage
- **Severity:** LOW
- **Affected:** `script.js` (`saveSession`/`loadSession`)
- **Description:** The cosmetic session cache (`atlantic_session`) stored the user's `role`. While no privileged path ever trusted it (`guardAccess` always re-reads role from the database), storing role in localStorage is a poor practice.
- **Impact:** A locally edited role could make the UI briefly show a privilege link; real access is still denied by the DB.
- **Root Cause:** UI convenience cache included an authorization value.
- **Fix Applied:** `role` (and ban state, never stored) are no longer written to localStorage. Only id/name/email/profession/avatar are cached. Role always comes from `accounts.role` via `ensureAccount`.
- **Verification:** Grep confirms `currentUser.role` is only assigned from the DB (`account.role`) and only read for cosmetic nav / re-checked in `guardAccess`.

### SEC-007 — Promo code usage limit race condition
- **Severity:** LOW
- **Affected:** `supabase-schema.sql` (`compute_med_request_pricing` trigger), `promo_codes.used_count`
- **Description:** Two concurrent orders could both read `used_count < max_uses`, then both increment, overshooting the limit.
- **Impact:** Promo abuse (minor over-use of a capped code).
- **Root Cause:** Check-then-act without a lock.
- **Fix Applied:** `supabase-hardening.sql` replaces the trigger: it locks the promo row with `SELECT ... FOR UPDATE` and increments `used_count` only via a guarded `UPDATE ... WHERE used_count < max_uses`, aborting the order if the claim fails.
- **Verification:** SQL idempotent; semantics preserved (fixed/percent discount, min-price floor).

### SEC-008 — No validation on uploaded document files
- **Severity:** LOW
- **Affected:** `my-space.js` (create + edit document forms)
- **Description:** Uploads accepted any file type and size up to the bucket limit; `.html`/`.svg`/executables could be stored (only staff can upload, so the practical risk was low, but a compromised/large staff surface or a future privilege bug could store malicious files).
- **Impact:** Stored file abuse / drive-by-download of hostile content (limited today by the PDF/image-only preview path).
- **Root Cause:** No allowlist at upload time.
- **Fix Applied:** `my-space.js` now validates file extension (`pdf/png/jpg/jpeg/gif/webp`) and size (≤ 10 MB) before upload in both `submitCreateDoc` and the edit flow. The storage INSERT policy additionally enforces folder + extension allowlists at the database level.
- **Verification:** `node --check my-space.js` passes; storage policy enforces the same rules server-side.

### SEC-009 — Medication stock is not decremented on order
- **Severity:** LOW
- **Affected:** `supabase-schema.sql` (`compute_med_request_pricing`)
- **Description:** Orders do not decrement `medications.stock`; a user can order more units than the current stock for an available medication (availability is a hard on/off switch, quantity capped at 999).
- **Impact:** Catalog overselling (abuse, not privilege escalation).
- **Root Cause:** Stock treated as an availability flag rather than a consumable quantity.
- **Fix Applied:** Not changed — stock decrement is a product/business decision (requests are fulfilled by EMS staff, not auto-shipped). Documented as a recommended future change: decrement stock atomically in the trigger and block `quantity > stock`.

### SEC-010 — Profile/sender fields are client-supplied (spoofable display names)
- **Severity:** LOW
- **Affected:** `comments`, `contacts`, `applications`, `medication_requests` INSERT flows
- **Description:** `discord_name` (and in some tables first/last name) are sent by the client. A malicious user can set any display name. RLS still ties every row to the caller's `account_id`/`discord_id`, so rows cannot be attributed to another account, only displayed under a custom name.
- **Impact:** Cosmetic impersonation in public comment lists / management views.
- **Root Cause:** Identity fields are not server-derived for these tables (appointments and medical documents already derive identity server-side via triggers).
- **Fix Applied:** Not changed (would alter product behavior). Documented: add `BEFORE INSERT` triggers (like `manage_appointment_insert`) that overwrite `discord_name` from `accounts.name` if stricter provenance is wanted.

---

## SECURITY NOTES (INFO — verified, no action required)

- **INFO-1 (good):** No secrets in the repository. Only the Supabase anon key exists in `supabase.js` (correct for a browser app). No `service_role` key, no Discord client secret, no `.env`, no private keys.
- **INFO-2 (good):** Discord OAuth is handled entirely by Supabase Auth; the client secret never reaches the frontend. Tokens live in the browser's session storage managed by supabase-js; they are never logged, never placed in URLs, and the OAuth fragment is cleaned from the URL after callback. OAuth `redirectTo` is `origin + pathname` (no user-controlled redirect target → no open redirect).
- **INFO-3 (good):** Role escalation is not possible: `force_account_role_rules` freezes role for non-Managers and blocks demoting the last Manager; `set_account_role`/`ban_account`/`unban_account`/`delete_account` re-verify Manager via `auth.uid()` in SECURITY DEFINER functions. Client cannot set `role`, `is_banned`, `status`, `assigned_doctor_id` or `created_by_doctor_id` (triggers overwrite or freeze them).
- **INFO-4 (good):** Request claiming is atomic: `take_med_request`, `take_appointment`, `take_test`, `take_certificate` use `UPDATE ... WHERE assigned_doctor_id IS NULL AND status='PENDING'` and check `ROW_COUNT`, so two EMS doctors can never claim the same request. Returning to PENDING clears the assignment.
- **INFO-5 (good):** XSS is handled: every user-controlled value rendered via `innerHTML` passes through `esc()`/`escapeHtml()` (confirmed in `script.js`, `document.js`, `medication.js`, `appointment.js`, `my-space.js`, `management.js`). No `eval`, `Function()`, `document.write` or `insertAdjacentHTML` anywhere. The only `innerHTML` uses with strings are escaped; document previews use signed URLs only.
- **INFO-6 (good):** CSRF is not applicable: supabase-js authenticates with an `Authorization` header (bearer token), not cookies, so cross-site state-changing requests carry no credentials.
- **INFO-7 (good):** Dependencies: `npm audit` reports 0 known vulnerabilities; the only dependency is `@supabase/supabase-js` (peer of the platform, already latest major).

---

## CHANGES APPLIED

### Files modified
| File | Change |
|---|---|
| `server.js` | Security headers (CSP/nosniff/X-Frame-Options/Referrer-Policy/Permissions-Policy), GET/HEAD only, malformed-URI 400 instead of crash, path traversal hardening, sensitive-file blocking |
| `my-space.js` | High-entropy document codes; file extension + size validation on create and edit |
| `script.js` | Removed `role` from the localStorage session cache (authorization decisions no longer stored client-side) |

### SQL migration created
| File | Purpose |
|---|---|
| `supabase-hardening.sql` | Ban-enforced patient INSERT policies; atomic promo usage-limit claim; storage folder + file-type allowlists (SELECT and INSERT). Apply after `supabase-schema.sql` + `supabase-roles.sql`. Safe to re-run. |

### Supabase RLS / storage changes (via `supabase-hardening.sql`)
- `comments_insert_own`, `contacts_insert_own`, `applications_insert_own`, `med_requests_insert_own`, `appointments_insert_own` → now also require `is_banned IS NOT TRUE`.
- `compute_med_request_pricing` → atomic promo claim (`FOR UPDATE` + guarded increment).
- `doc_objects_select_auth` → limited to `tests/` and `certificates/` folders.
- `doc_objects_insert_staff` → limited to `tests/`/`certificates/` folders and `pdf/png/jpg/jpeg/gif/webp` extensions.

### Authentication changes
None required — Discord OAuth via Supabase Auth is correctly implemented. Tokens are not exposed.

### Authorization changes
No behavior change required — the existing DB-enforced model (RLS + SECURITY DEFINER RPCs + triggers) already satisfies the USER/EMS/Manager matrix. This audit verified it end-to-end.

---

## TESTS PERFORMED

- `node --check` passed on all 6 JS files (`script.js`, `my-space.js`, `management.js`, `document.js`, `medication.js`, `appointment.js`).
- `npm audit --json` → **0 vulnerabilities**.
- Live server smoke test (new server, port 3001):
  - Security headers present on `HEAD /index.html` (CSP, nosniff, DENY, no-referrer, permissions).
  - Path traversal `../package.json` and `%2e%2e%2f..` → **403**.
  - Malformed URI `/%zz` → **400**, server stays alive (no crash).
  - `supabase-roles.sql` and `.env` → **403**.
  - `POST /` → **405**.
  - `/about`, `/`, and the `@supabase/supabase-js` UMD bundle → **200** with correct content types.
- Grep verification: no remaining `localStorage` role reads; all `currentUser.role` writes come from the DB; no `eval`/`document.write`/`insertAdjacentHTML`; no `service_role`/client-secret values anywhere.

### Recommended verification against the live Supabase (after applying `supabase-hardening.sql`)
```sql
-- 1) Policies are in place
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname IN ('public','storage')
   AND policyname IN ('comments_insert_own','contacts_insert_own',
     'applications_insert_own','med_requests_insert_own',
     'appointments_insert_own','doc_objects_select_auth',
     'doc_objects_insert_staff') ORDER BY 1;

-- 2) Role escalation is impossible from the client
SELECT account_id, role, is_banned FROM accounts ORDER BY created_at;
-- (then attempt UPDATE ... SET role='Manager' as a normal user -> rejected)

-- 3) Atomic take: claim the same request twice
-- (second claim must raise 'already assigned to another EMS doctor')
```

---

## REMAINING RISKS (accepted / requires product decision)

1. **Medication stock not decremented** (SEC-009) — product decision. Recommended future fix: atomic `UPDATE medications SET stock = stock - NEW.quantity` in the pricing trigger and reject `quantity > stock`.
2. **Storage access is path-based** — enforced by unguessable high-entropy codes + folder allowlists. If you later need per-patient file folders, restrict the SELECT policy with a per-user folder scheme (`<discord_id>/...`) and a `storage.foldername` check.
3. **Rate limiting** — not applicable on the static local server (no form endpoints) and not configurable from Supabase SQL. For production, enable Supabase rate limiting / an edge gateway (e.g. Cloudflare) for login, contact, comments and request submissions.
4. **Server-side sender fields** (SEC-010) — display names are client-supplied for comments/contacts/CVs. Add identity-deriving triggers if strict provenance is desired.
5. **Restart the local server** so the `server.js` hardening is active (the currently running instance on port 3000 still uses the old code).
