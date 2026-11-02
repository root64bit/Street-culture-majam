// Render synthetic email previews without a database, provider or real customer.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import ts from 'typescript';
const compiled = {};
for (const name of ['templates', 'order-template']) {
  const output = ts.transpileModule(readFileSync(`src/lib/communications/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', output)((specifier) => {
    if (specifier === './templates') return compiled.templates;
    throw new Error('Unexpected preview dependency');
  }, exports);
  compiled[name] = exports;
}
const folder = resolve('outputs/checkout-experience-release/20261019/email-previews');
mkdirSync(folder, { recursive: true });
const base = {
  kind: 'ORDER_CONFIRMED',
  orderNumber: 'SC00000000',
  orderUrl: 'https://www.streetculturevault.com/order/SC00000000',
  items: [{ name: 'Example sunglasses', size: 'One size', quantity: 1, price: 'MZN 78.00' }],
  subtotal: 'MZN 78.00',
  delivery: 'MZN 549.85',
  total: 'MZN 627.85',
  payments: ['£7.40 (Square)'],
  service: 'Economy',
  address: [
    'Synthetic Preview Buyer',
    'Example street 1',
    'Mayfair',
    'Johannesburg, Gauteng, 2092',
    'South Africa',
    '+27110000000',
  ],
};
for (const audience of ['customer', 'admin'])
  writeFileSync(
    resolve(folder, `${audience}.html`),
    compiled['order-template'].orderEmail({
      ...base,
      audience,
      kind: audience === 'admin' ? 'ADMIN_NEW_ORDER' : 'ORDER_CONFIRMED',
      orderUrl: audience === 'admin' ? 'https://www.streetculturevault.com/admin' : base.orderUrl,
    }).html
  );
if (process.argv[2] === 'serve') {
  createServer((req, res) => {
    const name =
      req.url === '/admin.html' ? 'admin' : req.url === '/customer.html' ? 'customer' : null;
    if (!name) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(readFileSync(resolve(folder, `${name}.html`)));
  }).listen(3032, '127.0.0.1', () =>
    console.log('Synthetic email previews on loopback 3032. No emails sent.')
  );
} else console.log('Rendered synthetic customer and admin email previews; no messages sent.');
