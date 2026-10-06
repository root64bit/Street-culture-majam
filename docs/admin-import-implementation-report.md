# Admin import implementation report

Status: implementation branch, 6 October 2026. This is not a claim that the ten photographed items are live or that production database migrations have been applied.

## Implemented

- Admin-only product and taxonomy writes, with staff read-only catalog access enforced in routes and Supabase RLS.
- Five-sheet Excel template at `/templates/street-culture-product-import.xlsx`; create-only upload, row validation, preview, downloadable error workbook, and confirmation in groups of 20.
- Transactional PostgreSQL import RPC. Each successful row creates an unpublished product, variant, and draft one-of-one listing; a failed row rolls back its own group.
- Separate listing publication and unpublication with admin authentication notes, uploaded product image check, and audit entries.
- Read-only product-folder preview: 13 PNGs, ten candidates, no image import or product publication.
- IP-suggested MZN/EUR/ZAR display currency with manual selector. EUR/ZAR are estimates; checkout remains MZN through M-Pesa.

## Verification completed locally

- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.
- Browser tests cover storefront, customer access, staff read-only access, manual admin draft creation, and staged Excel preview. Mocked M-Pesa tests require the separate test-only client feature flag and were not part of this gate.
- The import SQL integration test checks unpublished one-of-one creation and rollback of invalid quantity.
- A template read/write and browser upload test confirms that uploading only stages rows; no product appears before confirmation.

## Not shipped as sellable stock

The merchant confirmed ten real, authenticated, new, store-owned, one-size units, but the folder does not establish exact model names, MZN asking prices, or image-rights evidence. Online retail comparisons in `docs/product-pricing-research.md` are benchmarks, not approved prices. No item from that folder is published or in cloud inventory. Each item needs review, approved imagery, its actual asking price, and item-level publication notes.

## Deployment boundary

The four new migrations have only been applied and tested against local Supabase. Before production activation, inspect the cloud catalog for duplicate SKUs and migration compatibility, apply migrations in order, verify admin role and storage, deploy the app, and exercise import/publication in a controlled staging or production-safe test. A GitHub branch push alone does not complete these steps.
