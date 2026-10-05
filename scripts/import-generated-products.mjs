/**
 * Import owner-supplied concept photography as unpublished local catalog drafts.
 *
 * Usage (PowerShell):
 *   $env:NEXT_PUBLIC_SUPABASE_URL = '<local Supabase API URL>'
 *   $env:SUPABASE_SERVICE_ROLE_KEY = '<local service role key>'
 *   node scripts/import-generated-products.mjs 'C:\path\to\products'
 *
 * The importer intentionally refuses remote databases. It does not create stock,
 * prices, authentication records, or public listings. It is safe to rerun.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const entries = [
  { slug: 'concept-dior-book-tote', name: 'Dior patterned tote — concept draft', brand: 'dior', category: 'bags', photos: ['dior/1.png'] },
  { slug: 'concept-hermes-tan-top-handle', name: 'Hermès tan top-handle bag — concept draft', brand: 'hermes', category: 'bags', photos: ['hermes_birkin_bag/1.png'] },
  { slug: 'concept-hermes-taupe-top-handle', name: 'Hermès taupe top-handle bag — concept draft', brand: 'hermes', category: 'bags', photos: ['hermes_birkin_bag/2.png'] },
  { slug: 'concept-dior-monogram-crossbody', name: 'Dior monogram crossbody — concept draft', brand: 'dior', category: 'bags', photos: ['hermes_birkin_bag/3.png'] },
  { slug: 'concept-louis-vuitton-monogram-duffle', name: 'Louis Vuitton monogram duffle — concept draft', brand: 'louis-vuitton', category: 'bags', photos: ['Lv/1.png'] },
  { slug: 'concept-louis-vuitton-monogram-backpack', name: 'Louis Vuitton monogram backpack — concept draft', brand: 'louis-vuitton', category: 'bags', photos: ['Lv/2.png'] },
  { slug: 'concept-louis-vuitton-monogram-tote', name: 'Louis Vuitton monogram tote — concept draft', brand: 'louis-vuitton', category: 'bags', photos: ['Lv/3.png'] },
  { slug: 'concept-louis-vuitton-monogram-top-handle', name: 'Louis Vuitton monogram top-handle bag — concept draft', brand: 'louis-vuitton', category: 'bags', photos: ['Lv/4.png'] },
  { slug: 'concept-prada-black-backpack', name: 'Prada black backpack — concept draft', brand: 'prada', category: 'bags', photos: ['prada/ChatGPT Image Sep 28, 2026, 02_49_05 PM.png'] },
  { slug: 'concept-street-culture-passion-oud', name: 'Street Culture Passion Oud — concept draft', brand: 'street-culture', category: 'fragrance', photos: ['perfum/1.png', 'perfum/2.png', 'perfum/3.png'] },
];

const source = process.argv[2];
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!source || !apiUrl || !serviceKey) {
  throw new Error('Provide a source folder, local Supabase URL, and local service role key.');
}
const parsed = new URL(apiUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  throw new Error('This import is local-only. Remote databases are deliberately refused.');
}

const client = createClient(apiUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function one(table, slug, create) {
  const existing = await client.from(table).select('id').eq('slug', slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;
  const inserted = await client.from(table).insert(create).select('id').single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

const brandIds = {
  dior: await one('brands', 'dior', { name: 'Dior', slug: 'dior' }),
  hermes: await one('brands', 'hermes', { name: 'Hermès', slug: 'hermes' }),
  'louis-vuitton': await one('brands', 'louis-vuitton', { name: 'Louis Vuitton', slug: 'louis-vuitton' }),
  prada: await one('brands', 'prada', { name: 'Prada', slug: 'prada' }),
  'street-culture': await one('brands', 'street-culture', { name: 'Street Culture', slug: 'street-culture' }),
};
const categoryIds = {
  bags: await one('categories', 'bags', { name: 'Bags', slug: 'bags' }),
  fragrance: await one('categories', 'fragrance', { name: 'Fragrance', slug: 'fragrance', sort_order: 7 }),
};

let created = 0;
let uploaded = 0;
for (const entry of entries) {
  // Validate every source before inserting a product, avoiding image-less drafts.
  for (const photo of entry.photos) {
    const file = path.join(source, photo);
    const info = await stat(file);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error(`Invalid or oversized image: ${file}`);
  }

  const found = await client.from('products').select('id, active').eq('slug', entry.slug).maybeSingle();
  if (found.error) throw found.error;
  if (found.data?.active) throw new Error(`Refusing to alter an active product: ${entry.slug}`);
  let productId = found.data?.id;
  if (!productId) {
    const result = await client.from('products').insert({
      brand_id: brandIds[entry.brand], category_id: categoryIds[entry.category],
      name: entry.name, slug: entry.slug, currency: 'MZN', active: false, featured: false,
      description: 'Owner-supplied generated concept imagery. Physical stock, model, condition, authenticity and MZN price have not been verified. Do not publish or sell until reviewed.',
    }).select('id').single();
    if (result.error) throw result.error;
    productId = result.data.id;
    created++;
  }

  const media = await client.from('product_media').select('storage_path').eq('product_id', productId);
  if (media.error) throw media.error;
  const existingPaths = new Set(media.data.map((item) => item.storage_path));
  for (const [index, photo] of entry.photos.entries()) {
    const storagePath = `${productId}/concept-${index + 1}.png`;
    if (existingPaths.has(storagePath)) continue;
    const bytes = await readFile(path.join(source, photo));
    const upload = await client.storage.from('product-images').upload(storagePath, bytes, { contentType: 'image/png', upsert: false });
    // A prior interrupted run may have uploaded the file before inserting its DB row.
    if (upload.error && String(upload.error.statusCode) !== '409') throw upload.error;
    const row = await client.from('product_media').insert({
      product_id: productId, storage_path: storagePath, media_type: 'IMAGE', sort_order: index,
      alt_text: `${entry.name} — generated concept image ${index + 1}`,
    });
    if (row.error) throw row.error;
    uploaded++;
  }
  console.log(`${entry.name}: ${productId}`);
}

console.log(`Done: ${created} new unpublished drafts; ${uploaded} images attached. No sellable listings created.`);
