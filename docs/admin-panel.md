# Admin panel status and permissions

`/admin` shows real database counts for products, live/draft listings, and open orders. `/admin/products` lists the catalog, provides draft editing to ADMIN/SUPER_ADMIN, and links to `/admin/imports`. `/admin/imports` provides template download, Excel staging, validation preview, confirmation, import history, and error-workbook download.

STAFF may view the admin overview and product list. ADMIN/SUPER_ADMIN may create/edit products and taxonomy, upload product media, stage/confirm import, record authentication and publish/unpublish store listings. These checks run in route handlers and PostgreSQL RLS/RPCs, not only in hidden buttons. AUTHENTICATOR can manage authentication records under its own role policy but cannot publish a store listing without ADMIN. `admin_audit_logs` records imported products and publication transitions.

Live-listing safeguards: one unit, MZN, positive approved asking price, store ownership, an uploaded image in `product-images`, and a recorded item-level decision. Imported rows never publish automatically. M-Pesa checkout continues to charge MZN. Storefront EUR/ZAR displays use daily exchange rates, inferred by Vercel country header or overridden by the shopper, and are explicitly estimates.

Not yet implemented: operational order/payment/consignment/seller/customer/payout/commission/shipping/media/report modules, global search and command palette, product bulk edit/export, import update modes, background job queue, and full pagination. The dashboard currently exposes only four real metrics. Do not treat the admin brief's full definition of done as complete.
