// ============================================================
// SUPABASE CLIENT
// - Auth   : REAL Supabase Auth (Discord OAuth2).
//            All token exchange happens on Supabase servers;
//            the CLIENT_SECRET never reaches this file.
// - Data   : Supabase Database is the single source of truth.
//            There is NO localStorage fallback anymore — every
//            table write/read goes to the real database.
//            Apply supabase-schema.sql first (4 tables).
// ============================================================

(function () {
  const SUPABASE_URL = 'https://tumrzwermkicjuvzlisi.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bXJ6d2VybWtpY2p1dnpsaXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3OTcxMjMsImV4cCI6MjEwMjM3MzEyM30.7lAelNM56RtWHOXInj58G0ijbHOxxicSlcYxB5XqXOg';

  // Real Supabase client (UMD bundle exposes `window.supabase.createClient`)
  const realClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window.supabase = {
    // REAL auth: Discord OAuth2, session persistence.
    auth: realClient.auth,
    // REAL data: every table lives in Supabase (accounts, applications,
    // contacts, comments, medications, promo_codes, medication_requests).
    from: function (table) {
      return realClient.from(table);
    },
    // REAL RPC: calls Postgres functions (e.g. validate_promo_code).
    rpc: function (fn, args) {
      return realClient.rpc(fn, args);
    },
    storage: realClient.storage,
    // The full real client (kept for backwards compatibility).
    real: realClient
  };
})();
