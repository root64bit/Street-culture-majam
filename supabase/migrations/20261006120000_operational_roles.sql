-- Extend the existing role model without invalidating current STAFF/ADMIN users.
-- PostgreSQL requires newly added enum labels to commit before they are used.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'OPERATIONS';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'CATALOG_MANAGER';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'FULFILLMENT';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'SUPPORT';
