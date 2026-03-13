-- ═══════════════════════════════════════════════════════════════
--  Memron AI — Enable Row Level Security on all public tables
-- ═══════════════════════════════════════════════════════════════
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
--  What this does:
--  ✅ Enables RLS on all 12 public tables
--  ✅ Blocks all access via PostgREST (anon / authenticated roles)
--  ✅ Server-side code (pg.Pool with postgres user) is UNAFFECTED
--     because the postgres superuser bypasses RLS automatically
--
--  IMPORTANT: Run this ONCE. It is idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════

-- 1. Enable RLS on every public table
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buckets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bucket_shares      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_pending_auth   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_auth_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_snapshots ENABLE ROW LEVEL SECURITY;

-- 2. Revoke direct access from public-facing roles
--    (Belt-and-suspenders — RLS with no policies already blocks access,
--     but this explicitly revokes any default grants too)
REVOKE ALL ON public.users              FROM anon, authenticated;
REVOKE ALL ON public.memories           FROM anon, authenticated;
REVOKE ALL ON public.organizations      FROM anon, authenticated;
REVOKE ALL ON public.org_members        FROM anon, authenticated;
REVOKE ALL ON public.api_keys           FROM anon, authenticated;
REVOKE ALL ON public.buckets            FROM anon, authenticated;
REVOKE ALL ON public.bucket_shares      FROM anon, authenticated;
REVOKE ALL ON public.mcp_oauth_clients  FROM anon, authenticated;
REVOKE ALL ON public.mcp_pending_auth   FROM anon, authenticated;
REVOKE ALL ON public.mcp_auth_codes     FROM anon, authenticated;
REVOKE ALL ON public.mcp_refresh_tokens FROM anon, authenticated;
REVOKE ALL ON public.forensic_snapshots FROM anon, authenticated;

-- 3. Also revoke default privileges on future tables in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- Done. Verify with:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
