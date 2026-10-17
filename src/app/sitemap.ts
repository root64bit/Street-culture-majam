import type { MetadataRoute } from 'next';
import { queryCatalogPage } from '@/services/catalog.service';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.streetculturevault.com'
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
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/shipping`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${baseUrl}/returns`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${baseUrl}/consignment-terms`, changeFrequency: 'yearly', priority: 0.4 },
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
