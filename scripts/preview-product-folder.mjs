/**
 * Read-only product-photo scanner. It never contacts Supabase or writes products.
 * Usage: node scripts/preview-product-folder.mjs "C:\\path\\to\\products" [output.json]
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const knownGroups = [
  { reference: 'FOLDER-DIOR-TOTE', name: 'Dior patterned tote', brand: 'Dior', category: 'Bags', assets: ['dior/1.png'] },
  { reference: 'FOLDER-HERMES-TAN', name: 'Hermès tan top-handle bag', brand: 'Hermès', category: 'Bags', assets: ['hermes_birkin_bag/1.png'] },
  { reference: 'FOLDER-HERMES-TAUPE', name: 'Hermès taupe top-handle bag', brand: 'Hermès', category: 'Bags', assets: ['hermes_birkin_bag/2.png'] },
  { reference: 'FOLDER-DIOR-CROSSBODY', name: 'Dior monogram crossbody', brand: 'Dior', category: 'Bags', assets: ['hermes_birkin_bag/3.png'] },
  { reference: 'FOLDER-LV-DUFFLE', name: 'Louis Vuitton monogram duffle', brand: 'Louis Vuitton', category: 'Bags', assets: ['Lv/1.png'] },
  { reference: 'FOLDER-LV-BACKPACK', name: 'Louis Vuitton monogram backpack', brand: 'Louis Vuitton', category: 'Bags', assets: ['Lv/2.png'] },
  { reference: 'FOLDER-LV-TOTE', name: 'Louis Vuitton monogram tote', brand: 'Louis Vuitton', category: 'Bags', assets: ['Lv/3.png'] },
  { reference: 'FOLDER-LV-TOP-HANDLE', name: 'Louis Vuitton monogram top-handle bag', brand: 'Louis Vuitton', category: 'Bags', assets: ['Lv/4.png'] },
  { reference: 'FOLDER-PRADA-BACKPACK', name: 'Prada black backpack', brand: 'Prada', category: 'Bags', assets: ['prada/ChatGPT Image Sep 28, 2026, 02_49_05 PM.png'] },
  { reference: 'FOLDER-SC-PASSION-OUD', name: 'Street Culture Passion Oud', brand: 'Street Culture', category: 'Fragrance', assets: ['perfum/1.png', 'perfum/2.png', 'perfum/3.png'] },
];
const promotionalAssets = new Set(['perfum/4.png']);
const requiredReview = ['exact model', 'selling price (MZN)', 'image rights'];

const source = process.argv[2];
const destination = process.argv[3];
if (!source) throw new Error('Provide the product folder path.');
if (!(await stat(source)).isDirectory()) throw new Error('Product folder is not a directory.');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(fullPath));
    else if (entry.isFile()) paths.push(fullPath);
  }
  return paths;
}

const files = [];
for (const fullPath of (await walk(source)).sort()) {
  const relativePath = path.relative(source, fullPath).replaceAll('\\', '/');
  const bytes = await readFile(fullPath);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const mimeType = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : null;
  files.push({
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mimeType,
    validImage: Boolean(mimeType) && bytes.length <= 10 * 1024 * 1024,
    width: png ? bytes.readUInt32BE(16) : null,
    height: png ? bytes.readUInt32BE(20) : null,
  });
}

const byPath = new Map(files.map((file) => [file.path, file]));
const assigned = new Set();
const candidates = knownGroups.map((group) => {
  for (const asset of group.assets) {
    if (!byPath.has(asset)) throw new Error(`Expected asset missing: ${asset}`);
    assigned.add(asset);
  }
  return {
    reference: group.reference,
    proposedName: group.name,
    proposedBrand: group.brand,
    proposedCategory: group.category,
    imagePaths: group.assets,
    reviewState: 'REQUIRES_REVIEW',
    importable: false,
    reviewRequired: requiredReview,
    inventoryConfirmation: 'Merchant confirms real authenticated store-owned stock: one new STANDARD-size unit per candidate.',
    sellingPrice: null,
    condition: 'NEW',
    ownershipType: 'STREET_CULTURE',
    size: 'ONE_SIZE',
    sizeSystem: 'STANDARD',
    quantity: 1,
    active: false,
  };
});
const ungrouped = files.filter((file) => !assigned.has(file.path) && !promotionalAssets.has(file.path)).map((file) => file.path);
const promotional = files.filter((file) => promotionalAssets.has(file.path)).map((file) => file.path);
const hashCounts = new Map();
for (const file of files) hashCounts.set(file.sha256, (hashCounts.get(file.sha256) ?? 0) + 1);
const preview = {
  sourceLabel: 'Street culture docs/products',
  fileCount: files.length,
  validImageCount: files.filter((file) => file.validImage).length,
  duplicateHashes: [...hashCounts.values()].filter((count) => count > 1).length,
  candidateCount: candidates.length,
  candidates,
  promotional,
  ungrouped,
  files,
};

if (destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(preview, null, 2)}\n`, { flag: 'w' });
  console.log(`Preview written: ${destination}`);
}
console.log(`Scanned ${files.length} files; ${candidates.length} review candidates; ${promotional.length} promotional; ${ungrouped.length} ungrouped. No database or storage writes.`);
