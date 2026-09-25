# STREET CULTURE — Technical Architecture Specification

**Version:** 1.0.0  
**Status:** Local Development Foundation  

---

## 1. System Overview

STREET CULTURE is an authenticated luxury streetwear, sneaker, fashion, and collectibles resale marketplace. The system operates on a dual-inventory model:
1. **Street Culture Direct Inventory:** Vault-owned authentic goods.
2. **Consignment Inventory:** Authenticated items held in vault custody and listed on behalf of individual or professional consignors.

The platform visual identity is strictly guided by the Google Stitch project (`https://stitch.google.com/projects/8657326631814780527`), featuring a **Liquid Glass / Water Glass UI**, dark luxury palette (`#0a0b0d`), specular reflections, frosted glass cards, and high-visibility **Acid Lime** accents (`#c6ff00`).

---

## 2. Technology Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Language:** TypeScript 5.7+ (Strict Mode)
- **Styling:** Tailwind CSS 3.4+ with custom Liquid Glass design tokens
- **Data & Auth:** Supabase (PostgreSQL 17, PostgREST, GoTrue Auth, Realtime, Storage)
- **Orchestration:** Supabase CLI local stack (via Docker)
- **Containerization:** Multi-stage Dockerfile for Next.js application
- **Validation:** Zod 3.24+ for client/server boundary validation
- **Testing:** Vitest, React Testing Library, Playwright E2E
- **Package Manager:** pnpm v12 (Node.js v22 LTS)

---

## 3. High-Level Architecture Diagram

```mermaid
flowchart TD
    Client["Client Browser (Next.js App Router)"]
    NextHost["Next.js Server (Port 3000)"]
    SupabaseAuth["Supabase Auth (Port 54321 /auth/v1)"]
    SupabaseDB["PostgreSQL 17 DB (Port 54322)"]
    SupabaseStorage["Supabase Storage (Port 54321 /storage/v1)"]
    Studio["Supabase Studio (Port 54323)"]

    Client -->|Hydrated UI / React Server Components| NextHost
    Client -->|Browser Supabase Client (Anon Key)| SupabaseAuth
    NextHost -->|Server Supabase Client (Cookies)| SupabaseAuth
    NextHost -->|Admin Client (Service Role - Server Only)| SupabaseDB
    NextHost -->|PostgREST API (RLS Enforced)| SupabaseDB
    Client -->|Signed URLs / Public CDN| SupabaseStorage
    Studio -->|Local Administration| SupabaseDB
```

---

## 4. Key Architectural Principles

1. **Server Components by Default:**  
   Pages and static catalog components fetch data via Server Components to reduce client bundle size and optimize SEO. Client Components (`'use client'`) are strictly reserved for interactive controls (modals, drawers, search overlays, filters).
2. **PostgreSQL RLS as the Primary Defense:**  
   Business security and access control are anchored in PostgreSQL Row Level Security policies. Middleware and UI guards provide UX routing, but the database guarantees data privacy.
3. **One-of-One Inventory Protection:**  
   Consignment items are unique. The system uses database-backed pessimistic locking (`SELECT FOR UPDATE` in `reserve_listing()`) to guarantee that concurrent checkout attempts cannot double-sell an item.
4. **Decoupled Payment Gateway Abstraction:**  
   Orders are not tightly coupled to any single payment processor. The `payments` table tracks provider (`STRIPE`, `PAYSTACK`, `MPESA`) and provider references agnostically.
5. **Multi-Currency Support:**  
   Every transaction, offer, and listing supports explicit currency tracking (`USD`, `EUR`, `GBP`, `ZAR`, `MZN`), avoiding floating-point rounding issues via `NUMERIC(12, 2)`.
