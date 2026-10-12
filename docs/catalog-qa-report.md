# Catalog QA report

QA date: 2026-10-12

## Automated checks

| Check                              | Result                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                   | Passed.                                                                                                     |
| `pnpm lint`                        | Passed with zero warnings/errors.                                                                           |
| `git diff --check`                 | Passed.                                                                                                     |
| `pnpm test`                        | 38 passed, 29 intentionally skipped because local Supabase credentials are opt-in for the general unit run. |
| Targeted real-Supabase integration | 2 passed.                                                                                                   |
| `pnpm build`                       | Passed; 71 routes generated/validated.                                                                      |
| Playwright browser suite           | 13 passed.                                                                                                  |

The browser payment tests used an M-Pesa-enabled test build and intercepted provider endpoints. No request was sent to MineScope and no real payment was attempted.

## Real database verification

The local Supabase migration was applied and the integration/E2E checks used actual local database, auth, storage and RLS behavior.

Verified sequence:

1. create admin, staff and customer users;
2. prove customer and read-only staff cannot create/publish products;
3. create an admin product draft;
4. upload a real local test image to Supabase Storage;
5. create a variant and inventory listing;
6. prove anonymous queries cannot see the draft;
7. record the authentication decision and publish;
8. prove anonymous `public_catalog_products` returns the product;
9. open `/shop` and the unique product detail route;
10. add the exact listing to the bag;
11. unpublish and clean up the test records.

## Catalog and responsive QA

The local production build was visually inspected at the default mobile-sized viewport and at 1440×900 desktop.

Verified:

- desktop filter sidebar and four-column content area;
- mobile two-column product grid and sticky filter drawer;
- unique product cards despite multiple listings;
- live result count;
- product gallery and exact listing selector;
- mobile sticky Add/Buy controls;
- complete footer and no horizontal page overflow;
- carousel autoplay/manual/reduced-motion behavior;
- wishlist persistence and Quick View add-to-bag;
- customer order/consignment isolation.

## Production validation

Read-only anonymous production checks found zero public catalog rows and one active `Bags` category. The private two-product record audit remains blocked by the expired admin session and unavailable service-role credential. Production migration, deployment and record publication were intentionally not attempted without explicit authorization.

## Remaining external step

After deployment is authorized, apply the migration, open both production products in the authenticated admin, resolve the exact diagnostic blockers, publish only eligible exact listings, and repeat anonymous `/shop`, product page, carousel and checkout validation against the deployed URL.
