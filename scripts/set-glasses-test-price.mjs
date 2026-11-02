// Explicit, one-listing production catalog change requested by the owner.
// Does not create orders, reserve stock, call payment gateways or change other products.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

if (process.argv[2] !== '--apply-one-dollar')
  throw new Error('Explicit --apply-one-dollar required');
const project = 'tysibniisuobzpmnhwkf';
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== project)
  throw new Error('Wrong project');
const product = '7d750235-edac-44f0-9412-91fda2dca318';
const listing = 'ddc2bf44-f892-4b03-960b-76d9cfcf3ac9';
const slug = 'prada-symbole-pr-17ws-black-sunglasses';
const directory = 'outputs/glasses-test-price';
mkdirSync(directory, { recursive: true });
if (existsSync(`${directory}/applied.json`))
  throw new Error('Already applied; inspect the saved receipt before any retry');
const query = (sql) =>
  JSON.parse(
    execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', sql], {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    })
  );
const fxResponse = await fetch('https://open.er-api.com/v6/latest/MZN', {
  signal: AbortSignal.timeout(10000),
});
const fx = await fxResponse.json();
const rateText = String(fx.rates?.USD);
if (
  !fxResponse.ok ||
  fx.result !== 'success' ||
  fx.base_code !== 'MZN' ||
  !/^0\.\d{1,12}$/.test(rateText) ||
  !fx.time_last_update_unix ||
  fx.time_last_update_unix > Date.now() / 1000 + 300 ||
  Date.now() / 1000 - fx.time_last_update_unix > 259200
) {
  throw new Error('Unavailable or stale exchange rate');
}
const fraction = rateText.split('.')[1];
const numerator = BigInt(fraction),
  denominator = 10n ** BigInt(fraction.length);
const minor = (100n * denominator + numerator / 2n) / numerator;
const amount = Number(minor) / 100;
if (!Number.isSafeInteger(Number(minor)) || amount < 1 || amount > 200)
  throw new Error('Unexpected US$1 conversion');
const before = query(
  `BEGIN READ ONLY; SELECT to_jsonb(l) AS listing, p.slug AS slug FROM public.listings l JOIN public.products p ON p.id=l.product_id WHERE l.id='${listing}' AND p.id='${product}'; COMMIT;`
).rows?.[0];
if (
  !before ||
  before.slug !== slug ||
  before.listing.status !== 'LIVE' ||
  before.listing.currency !== 'MZN' ||
  before.listing.ownership_type !== 'STREET_CULTURE' ||
  Number(before.listing.asking_price) !== 32900 ||
  before.listing.reserved_by_order_id ||
  before.listing.sold_at
)
  throw new Error('Listing changed or is not safe to reprice');
writeFileSync(`${directory}/before.json`, JSON.stringify(before, null, 2), { flag: 'wx' });
const metadata = {
  reason:
    'Owner requested a temporary US$1 equivalent price for this exact glasses listing to test checkout; no payment initiated.',
  source: 'codex_explicit_user_request',
  original_price_mzn: 32900,
  new_price_mzn: amount,
  requested_price: 1,
  requested_currency: 'USD',
  usd_per_mzn: rateText,
  fx_updated_at: new Date(fx.time_last_update_unix * 1000).toISOString(),
  fx_source: 'https://open.er-api.com/v6/latest/MZN',
  temporary_test_price: true,
};
const metadataSql = JSON.stringify(metadata).replaceAll("'", "''");
const result = query(`BEGIN;
SET LOCAL lock_timeout='5s';
DO $change$
DECLARE item public.listings%ROWTYPE;
BEGIN
 SELECT l.* INTO item FROM public.listings l JOIN public.products p ON p.id=l.product_id
 WHERE l.id='${listing}' AND p.id='${product}' AND p.slug='${slug}' AND p.active AND p.archived_at IS NULL FOR UPDATE OF l;
 IF NOT FOUND OR item.status<>'LIVE' OR item.ownership_type<>'STREET_CULTURE' OR item.currency<>'MZN'
  OR item.asking_price<>32900 OR item.reserved_by_order_id IS NOT NULL OR item.sold_at IS NOT NULL THEN
  RAISE EXCEPTION 'Listing changed; price not updated'; END IF;
 UPDATE public.listings SET asking_price=${amount.toFixed(2)} WHERE id=item.id;
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(NULL,'INVENTORY_ADJUST_PRICE','listing',item.id,'${metadataSql}'::jsonb);
END; $change$;
SELECT id,product_id,asking_price,currency,status FROM public.listings WHERE id='${listing}';
COMMIT;`);
const after = result.rows?.[0];
if (Number(after?.asking_price) !== amount || after.id !== listing)
  throw new Error('Inspect production: unexpected price-change response');
const receipt = {
  project,
  product,
  listing,
  slug,
  beforePriceMzn: 32900,
  priceMzn: amount,
  metadata,
  after,
  appliedAt: new Date().toISOString(),
  backupSha256: createHash('sha256')
    .update(readFileSync(`${directory}/before.json`))
    .digest('hex'),
};
writeFileSync(`${directory}/applied.json`, JSON.stringify(receipt, null, 2), { flag: 'wx' });
console.log(
  JSON.stringify(
    {
      product,
      listing,
      priceMzn: amount,
      previousPriceMzn: 32900,
      status: after.status,
      auditRecorded: true,
      paymentInitiated: false,
    },
    null,
    2
  )
);
