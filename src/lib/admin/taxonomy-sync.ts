import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/schemas/admin-catalog.schema';
import { matchTaxonomy, type Taxonomy } from '@/lib/admin/product-import';

export const CORE_DEFAULT_BRANDS = [
  'Jordan',
  'Nike',
  'Adidas',
  'New Balance',
  'Supreme',
  'Stussy',
  'Fear of God',
  'BAPE',
  'Off-White',
  'Travis Scott',
  'Street Culture',
];

export const CORE_DEFAULT_CATEGORIES = [
  'Sneakers',
  'Streetwear',
  'Luxury',
  'Bags',
  'Accessories',
  'Collectibles',
];

/**
 * Ensures required brands and categories exist in the database.
 * If candidate brands/categories or core defaults are missing, creates them automatically.
 */
export async function ensureTaxonomiesExist(
  client: SupabaseClient<Database>,
  brandCandidates: (string | undefined | null)[] = [],
  categoryCandidates: (string | undefined | null)[] = []
): Promise<{ brands: Taxonomy[]; categories: Taxonomy[] }> {
  // Use admin client if available (service role) to bypass RLS, fallback to client
  let db = client;
  try {
    db = createAdminClient();
  } catch {
    db = client;
  }

  // 1. Fetch current active brands & categories
  const [{ data: existingBrands }, { data: existingCategories }] = await Promise.all([
    db.from('brands').select('id,name,active').limit(1000),
    db.from('categories').select('id,name,active').limit(1000),
  ]);

  const currentBrands: Taxonomy[] = (existingBrands ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    active: b.active ?? true,
  }));
  const currentCategories: Taxonomy[] = (existingCategories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active ?? true,
  }));

  // 2. Identify missing brands from candidates + core defaults
  const allBrandCandidates = [...brandCandidates, ...CORE_DEFAULT_BRANDS]
    .filter((v): v is string => typeof v === 'string' && v.trim().length >= 2)
    .map((v) => v.trim());

  const missingBrandNames = new Set<string>();
  for (const name of allBrandCandidates) {
    if (!matchTaxonomy(name, currentBrands)) {
      missingBrandNames.add(name);
    }
  }

  // 3. Identify missing categories from candidates + core defaults
  const allCategoryCandidates = [...categoryCandidates, ...CORE_DEFAULT_CATEGORIES]
    .filter((v): v is string => typeof v === 'string' && v.trim().length >= 2)
    .map((v) => v.trim());

  const missingCategoryNames = new Set<string>();
  for (const name of allCategoryCandidates) {
    if (!matchTaxonomy(name, currentCategories)) {
      missingCategoryNames.add(name);
    }
  }

  // 4. Insert missing brands
  if (missingBrandNames.size > 0) {
    for (const name of missingBrandNames) {
      const baseSlug = slugify(name) || `brand-${Date.now()}`;
      try {
        await db.from('brands').upsert(
          {
            name,
            slug: baseSlug,
            active: true,
            featured: false,
          },
          { onConflict: 'slug' }
        );
      } catch {
        // Ignore duplicate or permission conflicts
      }
    }
  }

  // 5. Insert missing categories
  if (missingCategoryNames.size > 0) {
    for (const name of missingCategoryNames) {
      const baseSlug = slugify(name) || `cat-${Date.now()}`;
      try {
        await db.from('categories').upsert(
          {
            name,
            slug: baseSlug,
            active: true,
            sort_order: 0,
          },
          { onConflict: 'slug' }
        );
      } catch {
        // Ignore duplicate or permission conflicts
      }
    }
  }

  // 6. Re-query all brands & categories
  const [{ data: finalBrands }, { data: finalCategories }] = await Promise.all([
    db.from('brands').select('id,name,active').limit(1000),
    db.from('categories').select('id,name,active').limit(1000),
  ]);

  return {
    brands: (finalBrands ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      active: b.active ?? true,
    })),
    categories: (finalCategories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active ?? true,
    })),
  };
}
