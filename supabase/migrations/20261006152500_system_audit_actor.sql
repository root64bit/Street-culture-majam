-- Scheduled jobs are identifiable system events, not fabricated staff users.
ALTER TABLE public.admin_audit_logs ALTER COLUMN actor_id DROP NOT NULL;
