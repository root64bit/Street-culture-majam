# STREET CULTURE — Initial Technical Audit Report

**Date:** September 25, 2026  
**Project:** STREET CULTURE — Premium Authenticated Fashion Resale & Consignment Marketplace  
**Visual Direction:** Google Stitch Canonical Project (`https://stitch.google.com/projects/8657326631814780527`)  
**External Architectural Reference:** `https://github.com/devalentineomonya/multivender-ecommerce`  

---

## 1. Current State of the STREET CULTURE Project

### Repository & Toolchain Discovery
- **Initial Directory State:** The project directory (`c:\Users\YUNI\Downloads\projectos developing\street_culture`) was freshly created and empty.
- **Design Reference Assets:** A full-page high-fidelity snapshot was discovered from the Google Stitch workspace:  
  `fullpage_snapshot_stitch_google_com_2026-09-25-17-32-18.png`  
  This asset has been safely imported into `docs/stitch-design-reference.png` as our canonical visual guideline.
- **Node.js Environment:** System initially lacked Node on PATH. Standalone **Node.js v22.23.3 LTS** was downloaded and configured with persistent User environment variables.
- **Package Manager:** **pnpm v12.6.0** installed globally and configured with execution policies.
- **Supabase CLI:** **Supabase CLI v2.118.0** downloaded and installed locally in `C:\Users\YUNI\tools\supabase`.
- **Git Version Control:** **Git v2.55.0** initialized with default branch `main`.
- **Docker Toolchain:** Docker CLI v29.8.0 and Docker Compose v5.5.1 are installed. Docker Desktop requires WSL2 (`wsl --install`) to boot the Linux daemon on Windows.

---

## 2. Reference Repository Architecture (`multivender-ecommerce`)

The external repository `devalentineomonya/multivender-ecommerce` was analyzed for architectural patterns:
- **Core Stack:** Next.js (App Router), TypeScript, Hono API routes with Hono RPC, Drizzle ORM over PostgreSQL, Supabase Auth/SSR, and Paystack integration.
- **Multi-Vendor Mechanics:** Multi-vendor model where vendors register and manage listings, with buyer and vendor dashboards.
- **Data Flow:** Uses Drizzle ORM schema definitions and client-side form validation via React Hook Form + Zod.

---

## 3. Useful Patterns to Adopt

1. **Supabase SSR Cookie Synchronization:**  
   Adopting standard `@supabase/ssr` `createServerClient` and `createBrowserClient` with Next.js App Router cookie stores (`cookies()` from `next/headers`).
2. **Strict Zod Boundary Validation:**  
   Validating all input payloads (auth, consignment submission, offers, orders) server-side prior to processing.
3. **Cart & Order Historical Snapshotting:**  
   Capturing immutable snapshots of price, product name, brand, size, and condition at the moment of order placement rather than referencing mutable catalog records.
4. **Role Separation:**  
   Distinct workflows for buyers, consignors/sellers, authenticators, staff, and administrators.

---

## 4. Patterns Explicitly Rejected & Rationale

| Pattern from Reference | Reason for Rejection in STREET CULTURE |
| :--- | :--- |
| **Generic E-commerce UI** | STREET CULTURE strictly preserves the **Google Stitch Liquid Glass / Water Glass UI** with dark obsidian vault aesthetics, acid-lime accents, specular glass borders, and luxury typography. |
| **Drizzle ORM Layer** | Supabase already provides a native, highly-optimized PostgREST query engine and generated TypeScript types. Adding Drizzle creates dual-schema drift and bypasses PostgreSQL RLS mechanisms. |
| **Hono RPC API Route Layer** | Next.js 15 App Router natively provides Route Handlers and Server Actions. Adding Hono introduces unnecessary runtime abstraction and overhead. |
| **Hardcoded Single Payment Processor** | The reference binds directly to Paystack. STREET CULTURE implements an abstract payment service supporting Stripe, Paystack, M-Pesa, and card processors with multi-currency (`USD`, `EUR`, `GBP`, `ZAR`, `MZN`). |
| **Unreproducible DB Migrations** | The reference relies on ORM push commands. STREET CULTURE enforces **strict timestamped SQL migrations** (`YYYYMMDDHHMMSS_*.sql`) ensuring reproducible local and CI databases. |
| **Invented Technology Claims** | The platform truthfully presents physical specialist multi-point verification rather than fabricated claims of automated AI or blockchain inspection. |

---

## 5. Compatibility & Environmental Considerations

- **Next.js 15 & React 19:** Next.js 15 `cookies()` API is asynchronous (`await cookies()`). All Supabase server clients and middleware account for this async pattern.
- **pnpm v12 Execution Security:** pnpm v12 build script approvals are handled cleanly via `.npmrc` (`only-built-dependencies=esbuild,unrs-resolver`).
- **Windows PowerShell Execution:** PowerShell profile and script execution policies (`RemoteSigned`) configured to ensure clean developer CLI execution.

---

## 6. Security Baseline

- **Row Level Security (RLS):** Enabled across 100% of marketplace tables.
- **Zero Client-Side Trust:** Sensitive role decisions (`is_admin`, `is_authenticator`) are verified server-side using PostgreSQL functions with `SECURITY DEFINER` and database claims.
- **Secret Hygiene:** `SUPABASE_SERVICE_ROLE_KEY` is strictly server-only and blocked from client bundles.
- **Private Media Isolation:** Consignment submissions and authentication evidence are stored in private Supabase Storage buckets accessible solely via time-limited signed URLs.
- **Inventory Concurrency Guard:** One-of-one item protection ensures state transitions (`LIVE` → `RESERVED` → `SOLD`) prevent double-selling.

---

## 7. Recommended Final STREET CULTURE Architecture

```
street_culture/
├── docs/                      # Architectural specs, audit reports, workflow guides
│   ├── initial-technical-audit.md
│   ├── architecture.md
│   ├── database-schema.md
│   ├── local-development.md
│   ├── security.md
│   └── consignment-workflow.md
├── src/
│   ├── app/                   # Next.js App Router pages and route handlers
│   ├── components/            # Stitch Liquid Glass UI & layout primitives
│   │   ├── layout/            # Header, TrustStrip, Footer, Nav
│   │   └── ui/                # GlassPanel, Button, StatusBadge, VerifiedBadge, etc.
│   ├── features/              # Modular domain features (auth, catalog, consign, etc.)
│   ├── lib/                   # Supabase clients, error model, Zod schemas, utilities
│   ├── types/                 # Database schema types (database.types.ts)
│   └── middleware.ts          # Supabase SSR session refresh & route protection
├── supabase/
│   ├── migrations/            # Timestamped PostgreSQL migrations with full RLS
│   ├── seed.sql               # Seed brands, categories, products, commission rules
│   └── config.toml            # Supabase CLI local orchestration configuration
├── tests/
│   ├── setup.ts               # Testing library setup
│   ├── unit/                  # Vitest unit tests for components & utilities
│   ├── integration/           # Integration tests for Supabase clients & services
│   └── e2e/                   # Playwright end-to-end smoke tests
├── docker/                    # Docker support for Next.js application
├── Dockerfile                 # Multi-stage production container build
├── docker-compose.yml         # Containerized Next.js development service
└── package.json               # Scripts for dev, test, build, lint, and Supabase CLI
```
