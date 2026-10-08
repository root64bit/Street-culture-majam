ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'PACKED';
ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'READY_FOR_PICKUP';
ALTER TYPE public.order_fulfillment_status_enum ADD VALUE IF NOT EXISTS 'READY_FOR_PICKUP';
