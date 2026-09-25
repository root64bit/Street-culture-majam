# STREET CULTURE — Local Development Guide

## Prerequisites
- **Node.js:** v22.x LTS installed (`node -v`)
- **pnpm:** v12.x installed (`pnpm -v`)
- **Supabase CLI:** Installed and accessible via PATH (`supabase --version`)
- **Docker Desktop:** Installed and running (requires WSL2 enabled on Windows)

---

## Development Modes

### Mode A (Recommended Workflow)
In this mode, Next.js runs directly on the Windows host machine for fast Turbopack hot reload, while Supabase local microservices run in Docker.

```powershell
# 1. Start Supabase local stack
supabase start

# 2. Reset database and run seed data
supabase db reset

# 3. Generate TypeScript database types
pnpm db:types

# 4. Start Next.js development server
pnpm dev
```

- Web Application: `http://localhost:3000`
- Supabase Studio: `http://127.0.0.1:54323`
- Mail Testing (Inbucket): `http://127.0.0.1:54324`
- Supabase API: `http://127.0.0.1:54321`

---

### Mode B (Fully Containerized Workflow)
In this mode, Next.js runs inside a Docker container while communicating with local Supabase.

```powershell
# Build and start containerized Next.js
docker compose up -d --build
```

**Networking Note:**  
Inside a Docker container, `localhost` refers to the container itself. To reach Supabase running on the host from inside the container, configure:
```env
NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321
```

---

## Helpful Commands

| Task | Command |
| :--- | :--- |
| Start Next.js | `pnpm dev` |
| Build Next.js | `pnpm build` |
| Run Typecheck | `pnpm typecheck` |
| Run Linter | `pnpm lint` |
| Format Code | `pnpm format` |
| Run Unit Tests | `pnpm test` |
| Run E2E Tests | `pnpm test:e2e` |
| Start Supabase | `pnpm supabase:start` |
| Stop Supabase | `pnpm supabase:stop` |
| Supabase Status | `pnpm supabase:status` |
| Regenerate Types | `pnpm db:types` |
