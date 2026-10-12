# Admin publication workflow

## Editorial stages mapped to the existing schema

No competing database status enum was added. `admin_product_publication_diagnostics()` derives the editorial stage from the established product, media, variant, listing and authentication records.

| Stage              | Meaning                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `DRAFT`            | Required metadata, media, an active variant or a valid inventory listing is incomplete.                      |
| `READY_FOR_REVIEW` | Media, active variant and well-formed one-of-one listing exist; item-level authentication is still required. |
| `APPROVED`         | The exact listing has passed authentication but is not yet publicly live.                                    |
| `PUBLISHED`        | The product has at least one anonymous-readable live listing and is publicly visible.                        |
| `ARCHIVED`         | The product is archived and excluded from public commerce.                                                   |

## Publication checks

The diagnostic panel checks:

- product metadata;
- active brand and category;
- a real image object in `product-images`;
- at least one active variant;
- a positive-price, quantity-one MZN listing;
- valid own-stock or seller ownership;
- item-level authentication;
- a live public listing;
- product active/archive state.

Blockers are returned as stable codes (`METADATA`, `BRAND`, `CATEGORY`, `MEDIA`, `VARIANT`, `LISTING`, `AUTHENTICATION`, `PUBLICATION`, `ARCHIVED`) and human-readable repair actions.

## Admin experience

The product workspace presents:

- `PUBLICLY VISIBLE` or `NOT PUBLIC — ACTION REQUIRED`;
- current mapped workflow stage;
- media, active variant, draft listing and live listing counts;
- actionable links to the relevant metadata, media or listings tab;
- the existing authenticate/publish and unpublish controls;
- existing Featured and Most Wanted merchandising controls.

The product table's status reflects public sellability rather than only the product's `active` boolean.

## Authorization and safety

Diagnostics are `SECURITY DEFINER` only to inspect protected records, but execution is immediately guarded by the existing `products.read` capability. Anonymous callers cannot execute it. Publication still uses the existing privileged server/RPC path, including item-inspection confirmation and a decision note.

Bulk-imported products follow the same workflow. An import may create a draft, but it cannot bypass images, variants, exact listing authentication or publication.
