# STREET CULTURE — Security Architecture & RLS Guide

## 1. Defense-in-Depth Architecture

STREET CULTURE secures sensitive commerce operations across three tiers:
1. **Network & Edge:** Next.js Middleware checks session validity and handles immediate redirects for unauthenticated users accessing `/account/*`, `/consign/new`, and `/admin/*`.
2. **Application Server Boundary:** Server Actions and Route Handlers validate all incoming input schemas via Zod before querying the database.
3. **Database Engine:** PostgreSQL Row Level Security (RLS) policies enforce data isolation at the storage layer. Even if an API handler were flawed, the database prevents unauthorized reads, updates, or deletions.

---

## 2. Row Level Security Policies

### Profiles & Roles
- **Profiles:** Public users can read basic profile details (avatar, display name). Users can only update their own profile records (`auth.uid() = id`).
- **User Roles:** Read restricted to the user and staff/admins (`auth.uid() = user_id OR public.is_staff()`). Only admins can modify user roles.

### Orders & Carts
- **Carts:** Strict ownership isolation. Users can only select or mutate items within their own cart (`user_id = auth.uid()`).
- **Orders:** Buyers can only query orders matching their account (`user_id = auth.uid()`). Staff/admins have operational read/write access.

### Consignments & Authentications
- **Consignments:** Consignors can view and create their own submissions. Once a submission progresses past `DRAFT`, status transitions are restricted to authenticators and staff.
- **Media:** Private intake photos and evidence cannot be queried without authenticated role verification.

---

## 3. Storage Security & Signed URLs
- Public buckets (`avatars`, `product-images`, `brand-assets`, `editorial-assets`) are readable anonymously.
- Private buckets (`consignment-media`, `authentication-evidence`) require authenticated ownership checks or authenticator credentials. Files are accessed strictly via short-lived signed URLs.

---

## 4. Financial & Inventory Integrity
- **One-of-One Locking:** Pessimistic lock `SELECT FOR UPDATE` in `reserve_listing()` ensures inventory cannot be checked out simultaneously by multiple shoppers.
- **Server-Side Financial Snapshots:** Order totals, unit prices, commissions, and payout disbursals are computed server-side and snapshotted immutably into `order_items`.
