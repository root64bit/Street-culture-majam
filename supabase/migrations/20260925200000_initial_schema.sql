-- ==============================================================================
-- STREET CULTURE - Initial Schema Migration (Refined Complete Spec)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE profile_account_type AS ENUM ('BUYER', 'SELLER', 'BOTH', 'ADMIN', 'AUTHENTICATOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('CUSTOMER', 'SELLER', 'AUTHENTICATOR', 'STAFF', 'ADMIN', 'SUPER_ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE listing_ownership_type AS ENUM ('STREET_CULTURE', 'CONSIGNMENT', 'PROFESSIONAL_SELLER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE listing_status_enum AS ENUM (
        'DRAFT',
        'PENDING_REVIEW',
        'PENDING_AUTHENTICATION',
        'APPROVED',
        'LIVE',
        'RESERVED',
        'SOLD',
        'REJECTED',
        'RETURNED',
        'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE consignment_status_enum AS ENUM (
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'MORE_INFORMATION_REQUIRED',
        'APPROVED_FOR_DELIVERY',
        'REJECTED',
        'AWAITING_ITEM',
        'IN_TRANSIT',
        'RECEIVED',
        'AUTHENTICATION_PENDING',
        'AUTHENTICATION_IN_PROGRESS',
        'AUTHENTICATED',
        'AUTHENTICATION_FAILED',
        'PHOTOGRAPHY',
        'PRICING',
        'READY_TO_LIST',
        'LISTED',
        'RESERVED',
        'SOLD',
        'PAYOUT_PENDING',
        'PAID',
        'RETURN_REQUESTED',
        'RETURNED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE consignment_photo_type_enum AS ENUM (
        'FRONT',
        'BACK',
        'LEFT',
        'RIGHT',
        'LABEL',
        'SIZE_TAG',
        'SERIAL',
        'PACKAGING',
        'RECEIPT',
        'DETAIL',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE auth_record_status_enum AS ENUM (
        'PENDING',
        'IN_REVIEW',
        'PASSED',
        'FAILED',
        'MORE_INFORMATION_REQUIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_payment_status_enum AS ENUM (
        'UNPAID',
        'AUTHORIZED',
        'PAID',
        'FAILED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_fulfillment_status_enum AS ENUM (
        'UNFULFILLED',
        'IN_AUTHENTICATION',
        'PACKED',
        'SHIPPED',
        'DELIVERED',
        'RETURNED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_record_status_enum AS ENUM (
        'PENDING',
        'REQUIRES_ACTION',
        'SUCCEEDED',
        'FAILED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payout_status_enum AS ENUM (
        'PENDING',
        'APPROVED',
        'PROCESSING',
        'PAID',
        'FAILED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE offer_status_enum AS ENUM (
        'PENDING',
        'ACCEPTED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. UTILITY FUNCTIONS
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    display_name TEXT,
    avatar_path TEXT,
    phone TEXT,
    country_code TEXT,
    preferred_currency TEXT NOT NULL DEFAULT 'USD',
    account_type profile_account_type NOT NULL DEFAULT 'BUYER',
    account_status TEXT NOT NULL DEFAULT 'ACTIVE',
    is_verified_seller BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. SELLER PROFILES
CREATE TABLE IF NOT EXISTS public.seller_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_type TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    display_name TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'PENDING',
    total_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER seller_profiles_updated_at
BEFORE UPDATE ON public.seller_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. USER ROLES (SECURE RBAC)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(check_user_id UUID, check_role app_role)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id AND role = check_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'SUPER_ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.is_admin() OR public.has_role(auth.uid(), 'STAFF');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_authenticator()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.is_staff() OR public.has_role(auth.uid(), 'AUTHENTICATOR');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. BRANDS
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_path TEXT,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_path TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 9. PRODUCTS (CANONICAL CATALOG)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    model TEXT,
    style_code TEXT,
    sku TEXT UNIQUE,
    colorway TEXT,
    release_year INTEGER,
    gender TEXT CHECK (gender IN ('MEN', 'WOMEN', 'UNISEX', 'KIDS')),
    retail_price NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'USD',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 10. PRODUCT MEDIA
CREATE TABLE IF NOT EXISTS public.product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'IMAGE',
    sort_order INTEGER NOT NULL DEFAULT 0,
    alt_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. PRODUCT VARIANTS
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    size_system TEXT NOT NULL DEFAULT 'US' CHECK (size_system IN ('US', 'UK', 'EU', 'CM', 'STANDARD')),
    color TEXT,
    sku TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER product_variants_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 12. CONSIGNMENT SUBMISSIONS
CREATE TABLE IF NOT EXISTS public.consignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    brand_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    size TEXT NOT NULL,
    size_system TEXT NOT NULL DEFAULT 'US',
    condition TEXT NOT NULL,
    expected_price NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    purchase_year INTEGER,
    proof_of_purchase_path TEXT,
    delivery_method TEXT NOT NULL DEFAULT 'SHIP_TO_VAULT',
    status consignment_status_enum NOT NULL DEFAULT 'DRAFT',
    seller_notes TEXT,
    internal_notes TEXT,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER consignment_submissions_updated_at
BEFORE UPDATE ON public.consignment_submissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 13. CONSIGNMENT MEDIA
CREATE TABLE IF NOT EXISTS public.consignment_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consignment_submission_id UUID NOT NULL REFERENCES public.consignment_submissions(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    photo_type consignment_photo_type_enum NOT NULL DEFAULT 'FRONT',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. LISTINGS (ACTUAL SELLABLE ITEMS)
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ownership_type listing_ownership_type NOT NULL DEFAULT 'STREET_CULTURE',
    condition TEXT NOT NULL,
    status listing_status_enum NOT NULL DEFAULT 'DRAFT',
    asking_price NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    authentication_status TEXT NOT NULL DEFAULT 'PENDING',
    consignment_submission_id UUID REFERENCES public.consignment_submissions(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    reserved_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER listings_updated_at
BEFORE UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 15. AUTHENTICATION RECORDS
CREATE TABLE IF NOT EXISTS public.authentication_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    consignment_submission_id UUID REFERENCES public.consignment_submissions(id) ON DELETE SET NULL,
    authenticator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status auth_record_status_enum NOT NULL DEFAULT 'PENDING',
    condition_confirmed TEXT,
    decision_notes TEXT,
    authenticated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER auth_records_updated_at
BEFORE UPDATE ON public.authentication_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 16. WISHLIST
CREATE TABLE IF NOT EXISTS public.wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT wishlist_user_product_variant_unique UNIQUE NULLS NOT DISTINCT (user_id, product_id, variant_id)
);

-- 17. CARTS & CART ITEMS
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER carts_updated_at
BEFORE UPDATE ON public.carts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    price_snapshot NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cart_items_cart_listing_unique UNIQUE (cart_id, listing_id)
);

-- 18. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    order_number TEXT NOT NULL UNIQUE,
    status order_status_enum NOT NULL DEFAULT 'PENDING',
    currency TEXT NOT NULL DEFAULT 'USD',
    subtotal NUMERIC(12, 2) NOT NULL,
    shipping_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL,
    payment_status order_payment_status_enum NOT NULL DEFAULT 'UNPAID',
    fulfillment_status order_fulfillment_status_enum NOT NULL DEFAULT 'UNFULFILLED',
    shipping_address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    billing_address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 19. ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_name_snapshot TEXT NOT NULL,
    brand_name_snapshot TEXT NOT NULL,
    size_snapshot TEXT NOT NULL,
    condition_snapshot TEXT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    seller_net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_reference TEXT,
    status payment_record_status_enum NOT NULL DEFAULT 'PENDING',
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 21. SELLER PAYOUTS
CREATE TABLE IF NOT EXISTS public.seller_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    gross_amount NUMERIC(12, 2) NOT NULL,
    commission_amount NUMERIC(12, 2) NOT NULL,
    adjustments NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status payout_status_enum NOT NULL DEFAULT 'PENDING',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER seller_payouts_updated_at
BEFORE UPDATE ON public.seller_payouts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 22. COMMISSION RULES
CREATE TABLE IF NOT EXISTS public.commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    seller_type TEXT NOT NULL DEFAULT 'STANDARD',
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
    percentage NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    fixed_fee NUMERIC(12, 2) NOT NULL DEFAULT 5.00,
    minimum_fee NUMERIC(12, 2) NOT NULL DEFAULT 10.00,
    currency TEXT NOT NULL DEFAULT 'USD',
    priority INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER commission_rules_updated_at
BEFORE UPDATE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 23. OFFERS
CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status offer_status_enum NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER offers_updated_at
BEFORE UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 24. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. TRANSACTIONAL INVENTORY PROTECTION (RESERVE LISTING)
CREATE OR REPLACE FUNCTION public.reserve_listing(target_listing_id UUID, buyer_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    listing_row public.listings%ROWTYPE;
BEGIN
    -- Select with pessimistic lock
    SELECT * INTO listing_row
    FROM public.listings
    WHERE id = target_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % not found', target_listing_id;
    END IF;

    IF listing_row.status != 'LIVE' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.listings
    SET status = 'RESERVED',
        reserved_at = NOW(),
        updated_at = NOW()
    WHERE id = target_listing_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 26. AUTOMATIC USER PROFILE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, display_name, avatar_path)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_path', '')
    );
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'CUSTOMER');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 27. STORAGE BUCKETS SETUP
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('brand-assets', 'brand-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
    ('editorial-assets', 'editorial-assets', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('consignment-media', 'consignment-media', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    ('authentication-evidence', 'authentication-evidence', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 28. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authentication_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Public can read basic profile info; users can update own profile
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Seller Profiles: Public can view verified seller profiles; sellers can update own
CREATE POLICY "Public can view seller profiles"
ON public.seller_profiles FOR SELECT
USING (true);

CREATE POLICY "Sellers can manage own seller profile"
ON public.seller_profiles FOR ALL
USING (user_id = auth.uid() OR public.is_staff());

-- User roles: Only Staff/Admins can see roles; users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR public.is_staff());

CREATE POLICY "Only admins manage roles"
ON public.user_roles FOR ALL
USING (public.is_admin());

-- Brands & Categories: Everyone can read active, Staff can manage
CREATE POLICY "Public read active brands"
ON public.brands FOR SELECT
USING (active = true OR public.is_staff());

CREATE POLICY "Staff manage brands"
ON public.brands FOR ALL
USING (public.is_staff());

CREATE POLICY "Public read active categories"
ON public.categories FOR SELECT
USING (active = true OR public.is_staff());

CREATE POLICY "Staff manage categories"
ON public.categories FOR ALL
USING (public.is_staff());

-- Products & Variants: Public can read active products
CREATE POLICY "Public read active products"
ON public.products FOR SELECT
USING (active = true OR public.is_staff());

CREATE POLICY "Staff manage products"
ON public.products FOR ALL
USING (public.is_staff());

CREATE POLICY "Public read product media"
ON public.product_media FOR SELECT
USING (true);

CREATE POLICY "Staff manage product media"
ON public.product_media FOR ALL
USING (public.is_staff());

CREATE POLICY "Public read product variants"
ON public.product_variants FOR SELECT
USING (true);

CREATE POLICY "Staff manage product variants"
ON public.product_variants FOR ALL
USING (public.is_staff());

-- Listings: Public can read APPROVED / LIVE listings; Sellers can read/manage their own
CREATE POLICY "Public read live listings"
ON public.listings FOR SELECT
USING (status IN ('APPROVED', 'LIVE') OR seller_id = auth.uid() OR public.is_staff());

CREATE POLICY "Sellers can create listings"
ON public.listings FOR INSERT
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers can update own draft listings"
ON public.listings FOR UPDATE
USING (seller_id = auth.uid() OR public.is_staff())
WITH CHECK (seller_id = auth.uid() OR public.is_staff());

-- Consignment Submissions: Sellers can manage own, Staff/Authenticators can review
CREATE POLICY "Sellers can view own consignments"
ON public.consignment_submissions FOR SELECT
USING (seller_id = auth.uid() OR public.is_authenticator());

CREATE POLICY "Sellers can create consignments"
ON public.consignment_submissions FOR INSERT
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers can update draft consignments"
ON public.consignment_submissions FOR UPDATE
USING ((seller_id = auth.uid() AND status = 'DRAFT') OR public.is_authenticator())
WITH CHECK ((seller_id = auth.uid() AND status IN ('DRAFT', 'SUBMITTED')) OR public.is_authenticator());

CREATE POLICY "Consignment media access"
ON public.consignment_media FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.consignment_submissions cs
        WHERE cs.id = consignment_submission_id
        AND (cs.seller_id = auth.uid() OR public.is_authenticator())
    )
);

CREATE POLICY "Consignment media insert"
ON public.consignment_media FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.consignment_submissions cs
        WHERE cs.id = consignment_submission_id
        AND (cs.seller_id = auth.uid() OR public.is_authenticator())
    )
);

-- Authentication Records: Only Authenticators and Staff manage; listing owners can read
CREATE POLICY "Authenticators and Staff view authentication records"
ON public.authentication_records FOR SELECT
USING (
    public.is_authenticator() OR
    EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = listing_id AND l.seller_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.consignment_submissions cs
        WHERE cs.id = consignment_submission_id AND cs.seller_id = auth.uid()
    )
);

CREATE POLICY "Authenticators manage records"
ON public.authentication_records FOR ALL
USING (public.is_authenticator());

-- Wishlist: Users manage only their own wishlist items
CREATE POLICY "Users manage own wishlist"
ON public.wishlist_items FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Cart & Cart Items: Users access only their own cart
CREATE POLICY "Users manage own cart"
ON public.carts FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own cart items"
ON public.cart_items FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.carts c
        WHERE c.id = cart_id AND c.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.carts c
        WHERE c.id = cart_id AND c.user_id = auth.uid()
    )
);

-- Orders & Order Items: Users view their own orders; Staff manage all
CREATE POLICY "Users view own orders"
ON public.orders FOR SELECT
USING (user_id = auth.uid() OR public.is_staff());

CREATE POLICY "Staff manage orders"
ON public.orders FOR ALL
USING (public.is_staff());

CREATE POLICY "Users view own order items"
ON public.order_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_staff())
    )
);

-- Payments: Staff view/manage; Users can view payments for their own orders
CREATE POLICY "Users view payments for own orders"
ON public.payments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id AND o.user_id = auth.uid()
    ) OR public.is_staff()
);

-- Seller Payouts: Sellers see only their own payouts; Staff manage
CREATE POLICY "Sellers view own payouts"
ON public.seller_payouts FOR SELECT
USING (seller_id = auth.uid() OR public.is_staff());

CREATE POLICY "Staff manage payouts"
ON public.seller_payouts FOR ALL
USING (public.is_staff());

-- Commission Rules: Public can view active rules; Staff manage
CREATE POLICY "Public view active commission rules"
ON public.commission_rules FOR SELECT
USING (active = true OR public.is_staff());

CREATE POLICY "Staff manage commission rules"
ON public.commission_rules FOR ALL
USING (public.is_staff());

-- Offers: Buyers manage own offers; Sellers view offers on their listings
CREATE POLICY "Buyers manage own offers"
ON public.offers FOR ALL
USING (buyer_id = auth.uid())
WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Sellers view offers on their listings"
ON public.offers FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
);

-- Notifications: Users manage own notifications
CREATE POLICY "Users manage own notifications"
ON public.notifications FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Storage Objects Policies
CREATE POLICY "Public read for public buckets"
ON storage.objects FOR SELECT
USING (bucket_id IN ('avatars', 'product-images', 'brand-assets', 'editorial-assets'));

CREATE POLICY "Authenticated users upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff manage product and brand images"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id IN ('product-images', 'brand-assets', 'editorial-assets') AND public.is_staff());

CREATE POLICY "Private consignment submission uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'consignment-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Private consignment submission reads"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'consignment-media' AND
    ((storage.foldername(name))[1] = auth.uid()::text OR public.is_authenticator())
);

CREATE POLICY "Authentication evidence reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'authentication-evidence' AND public.is_authenticator());

CREATE POLICY "Authentication evidence uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'authentication-evidence' AND public.is_authenticator());
