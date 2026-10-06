# Excel import template specification

Download `/templates/street-culture-product-import.xlsx` from `/admin/imports`. The workbook has five sheets: `PRODUCTS`, `VARIANTS`, `MEDIA`, `INSTRUCTIONS`, and `REFERENCE VALUES`. It has no example rows on import sheets; examples are only on `INSTRUCTIONS`.

`PRODUCTS.product_reference` is the stable required key. Each `VARIANTS.product_reference` repeats it; each product needs at least one active variant. `MEDIA` may have one row per reference with up to eight URLs. The importer accepts URLs only from this project's HTTPS `product-images` public bucket, mapped back to existing storage paths. It never fetches arbitrary remote URLs.

Current create-only import is deliberately limited to MZN-priced `STREET_CULTURE` stock, quantity **one** per active variant. It supports `NEW`, `LIKE_NEW`, `GOOD`, `FAIR`; size systems `US`, `UK`, `EU`, `CM`, `STANDARD`; and `TRUE/FALSE`, `YES/NO`, `1/0` booleans. Missing image is a warning, not permission to publish. Unknown brands/categories, unsupported ownership/currency, invalid money, duplicates, bad references, and malformed media URLs are blocking errors. Existing product references and variant SKUs are checked before staging, with unique database indexes guarding races.

Limits: `.xlsx` only, max 5 MB compressed file, max 500 product rows and 1,500 variant rows. Formula or rich-text cells are rejected; paste values. The downloadable error report escapes spreadsheet formula prefixes.

The template's reference sheet shows examples, not a live taxonomy snapshot. Brand/category values must match active catalog names exactly after case and whitespace normalization. Admins can create or map missing taxonomy before reuploading a corrected workbook.
