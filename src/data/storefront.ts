export type ProductCategory = string;

export interface StoreProduct {
  id: string;
  listingId?: string;
  productId?: string;
  name: string;
  slug: string;
  brand: string;
  category: ProductCategory;
  categoryName?: string;
  brandSlug?: string;
  price: number;
  condition: string;
  sizes: string[];
  ownershipType?: string;
  authenticationStatus?: string;
  image: string;
  imagePosition: string;
  isNew?: boolean;
}

export const storeProducts: StoreProduct[] = [
  {
    id: 'sc-runner-ivory',
    name: 'Archive Runner — Ivory',
    slug: 'archive-runner-ivory',
    brand: 'STREET CULTURE',
    category: 'sneakers',
    price: 14800,
    condition: 'New',
    sizes: ['US 7', 'US 8', 'US 8.5', 'US 9', 'US 10', 'US 11'],
    image: '/images/street-culture-products.png',
    imagePosition: '50% 38%',
    isNew: true,
  },
  {
    id: 'sc-runner-black',
    name: 'Core Runner — Triple Black',
    slug: 'core-runner-triple-black',
    brand: 'STREET CULTURE',
    category: 'sneakers',
    price: 13200,
    condition: 'New',
    sizes: ['US 7', 'US 8', 'US 9', 'US 10', 'US 11'],
    image: '/images/street-culture-products.png',
    imagePosition: '12% 82%',
  },
  {
    id: 'sc-runner-olive',
    name: 'Terrain Runner — Olive',
    slug: 'terrain-runner-olive',
    brand: 'STREET CULTURE',
    category: 'sneakers',
    price: 13900,
    condition: 'New',
    sizes: ['US 8', 'US 8.5', 'US 9', 'US 10'],
    image: '/images/street-culture-products.png',
    imagePosition: '86% 82%',
    isNew: true,
  },
  {
    id: 'sc-shell-black',
    name: 'Technical Shell — Black',
    slug: 'technical-shell-black',
    brand: 'STREET CULTURE',
    category: 'streetwear',
    price: 9800,
    condition: 'New',
    sizes: ['S', 'M', 'L', 'XL'],
    image: '/images/street-culture-products.png',
    imagePosition: '82% 14%',
  },
  {
    id: 'sc-edition-01',
    name: 'Edition 01 — Coastal Set',
    slug: 'edition-01-coastal-set',
    brand: 'SC EDITIONS',
    category: 'luxury',
    price: 18500,
    condition: 'New',
    sizes: ['XS', 'S', 'M', 'L'],
    image: '/images/street-culture-hero.png',
    imagePosition: '64% 42%',
    isNew: true,
  },
  {
    id: 'sc-lime-bag',
    name: 'Signal Mini Bag — Acid',
    slug: 'signal-mini-bag-acid',
    brand: 'SC OBJECTS',
    category: 'accessories',
    price: 7200,
    condition: 'New',
    sizes: ['One size'],
    image: '/images/street-culture-hero.png',
    imagePosition: '56% 28%',
  },
];

export const categoryCards = [
  { label: 'SNEAKERS', category: 'sneakers', position: '46% 62%' },
  { label: 'STREETWEAR', category: 'streetwear', position: '74% 36%' },
  { label: 'LUXURY', category: 'luxury', position: '58% 40%' },
  { label: 'BAGS & ACCESSORIES', category: 'accessories', position: '52% 25%' },
] as const;
