# Product-folder ingestion report

Source: `Street culture docs/products`, scanned 6 October 2026 with `node scripts/preview-product-folder.mjs`. The repeatable manifest is `data/product-folder-import-preview.json`.

- **13 files / 13 valid PNGs** across Dior, Hermès, LV, perfum, and Prada subfolders. No invalid files or byte-identical SHA-256 duplicates.
- **10 product candidates** map to 12 images. `perfum/4.png` is a seven-fragrance promotional collage and is excluded from product media.
- **5 apparent brands:** Dior, Hermès, Louis Vuitton, Prada, Street Culture. **2 categories:** bags and fragrance.
- **0 products imported into cloud or published** by the scanner. It is read-only and cannot silently create a listing.
- Merchant-confirmed defaults: each candidate is a real authenticated store-owned unit, new condition, STANDARD/ONE_SIZE, quantity one.
- Manual review remains for exact model, approved MZN asking price, and whether the image accurately represents the item and may be used commercially. The Prada image has a `ChatGPT Image` filename; appearance alone is not inventory evidence.

`hermes_birkin_bag/3.png` depicts a Dior-patterned crossbody and was grouped with Dior despite its directory. `Lv` capitalization and `perfum` spelling are inconsistent; numeric filenames have no SKU or stable product reference. The preview uses explicit stable `FOLDER-*` references and original file hashes.

Next: review each physical item against its photograph, choose the exact listing name and asking price, upload approved images to `product-images`, and use the staged admin workbook or manual editor. Publication needs an item-level authentication note and image-rights confirmation.
