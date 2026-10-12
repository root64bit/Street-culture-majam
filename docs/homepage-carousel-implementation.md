# Homepage carousel implementation

## Data strategy

The existing `THE NEXT OBSESSION.` section remains editorially intact and is backed by real public catalog data.

Eligible products are prioritized in this order:

1. `most_wanted` published products;
2. `featured` published products;
3. recently published products.

The query uses the product-centred public view. One product with several sizes appears once, while Quick View retains all exact listing options.

## Interaction

- desktop shows several cards with previous/next controls and progress;
- mobile exposes a swipeable snap carousel without page overflow;
- keyboard-accessible controls use labelled buttons and progress semantics;
- reduced-motion visitors receive manual controls without autoplay;
- wishlist and Quick View operate directly from each real card;
- an empty state appears only when the database has no eligible inventory.

## Categories

Homepage category cards now come from aggregate public facets. Each card uses the latest real eligible product image, reports a real distinct-product count and links to `/shop?category=<slug>`.

Categories with no public inventory are hidden from the shopping section. They can remain configured in admin without being presented as if products are available.

## Merchandising behavior

Existing admin bulk controls for `Featured` and `Most Wanted` persist to Supabase. These flags order already-public inventory; they never bypass listing authentication, publication state or RLS.
