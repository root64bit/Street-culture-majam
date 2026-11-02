import type { StoreProduct, StoreListingOption } from '@/data/storefront';
import { formatProductSize, isFootwearProduct, isPurchasableSize } from '@/lib/product-sizes';

export function purchasableOptions(product: StoreProduct): StoreListingOption[] {
  const options = product.listingOptions?.length ? product.listingOptions :
    product.listingId && product.sizes.length === 1 ? [{ listingId: product.listingId,
      size: product.sizes[0], sizeSystem: product.sizeSystem, price: product.price, condition: product.condition }] : [];
  const footwear = isFootwearProduct(product.categoryName || product.category, product.name);
  return options.filter((option) => isPurchasableSize(option.size, option.sizeSystem, footwear))
    .sort((a, b) => (a.sizeSystem || '').localeCompare(b.sizeSystem || '') ||
      a.size.localeCompare(b.size, 'en', { numeric: true }) || a.price - b.price || a.listingId.localeCompare(b.listingId));
}

export function productSizeSummary(product: StoreProduct) {
  const labels = purchasableOptions(product).map((option) => formatProductSize(option.size, option.sizeSystem));
  return [...new Set(labels)].join(' · ') || (isFootwearProduct(product.categoryName || product.category, product.name)
    ? 'Sizes awaiting confirmation' : product.sizes.map((size) => formatProductSize(size, product.sizeSystem)).join(' · '));
}
