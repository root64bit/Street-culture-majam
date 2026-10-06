# Product import operator guide

1. Open `/admin/imports` with an ADMIN or SUPER_ADMIN account and download the `.xlsx` template.
2. Fill `PRODUCTS` and `VARIANTS`; use one stable product reference per product and exactly one unit per active variant. Set MZN selling prices approved by the merchant. Examples on `INSTRUCTIONS` are not imported.
3. Upload the workbook. It becomes a staging batch only. Review every row's errors and warnings on the preview page. Download the error workbook to correct failures, then reupload.
4. The preview is the dry run: it shows which valid rows would create products and listings. Confirm create-only import explicitly. The UI commits at most 20 product groups per request; each group is transactional. A failed group does not leave a half-created product. Reupload corrected failed rows under new references or use the manual editor; automatic in-place retry/update is not yet available.
5. Imported catalog records and listings remain inactive/DRAFT/PENDING. Open `/admin/products`, inspect each physical item, verify the image in storage and approved asking price, enter a substantive authentication decision, affirm image rights, then click **Authenticate & publish**. Only then will shoppers see it. **Unpublish** is available while not reserved or sold.

Folder scan: run `node scripts/preview-product-folder.mjs "C:\path\to\products" data/product-folder-import-preview.json`. It does not upload images or modify the catalog. The promotional fragrance collage is excluded. Exact model, price, and imagery rights still require approval before converting those candidates into a workbook.

Current scope is create-only store-owned inventory. `UPDATE_EXISTING`, seller-owned import, automated arbitrary URL download, ZIP import, and one-click failed-row retry are intentionally unavailable rather than silently unsafe.
