import type { MetadataRoute } from 'next';
import { queryCatalogPage } from '@/services/catalog.service';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://street-culture-majam.vercel.app'
  ).replace(/\/$/, '');
  const products = [];
  for (let offset = 0; ; offset += 48) {
    const page = await queryCatalogPage({ sort: 'newest', limit: 48, offset });
    products.push(...page.rows);
    if (products.length >= page.count || page.rows.length === 0) break;
  }
  return [
    { url: baseUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/shop`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/new`, changeFrequency: 'daily', priority: 0.8 },
    ...products.flatMap((product) =>
      product.slug
        ? [
            {
              url: `${baseUrl}/products/${product.slug}`,
              lastModified: product.published_at || undefined,
              changeFrequency: 'daily' as const,
              priority: 0.8,
            },
          ]
        : []
    ),
  ];
}
