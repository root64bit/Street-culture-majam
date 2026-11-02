-- Supabase default privileges can grant service_role ALL on newly created tables.
-- Restrict direct writes; payment completion must use the atomic validation RPC.
REVOKE ALL ON public.payfast_sandbox_sessions FROM service_role;
GRANT SELECT,INSERT ON public.payfast_sandbox_sessions TO service_role;
