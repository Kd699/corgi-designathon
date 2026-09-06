/* Regression check for "Send says Grok is reading, then never does anything."
 *
 * Loads the deployed Logging tab, types, presses Send, and requires the status to leave
 * "reading" within LIMIT seconds — either "Composed by Grok" or an honest fallback. A send
 * that sits in the reading state past the limit is the bug, whatever the model eventually
 * returns. Usage: node scripts/send-latency.mjs [url] [limitSeconds]
 */
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'https://corgi-designathon.web.app/#/logging';
const LIMIT = Number(process.argv[3] ?? 12);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await p.locator('.mb-editor textarea').fill('Rain all morning so I skipped the run. Coffee with Leila at eleven cheered me up. Two solid hours on the report after lunch, then a landlord call that went nowhere.');
await p.waitForTimeout(500);
const t0 = Date.now();
await p.getByRole('button', { name: 'Send', exact: true }).click();
let outcome = 'still reading';
try {
  await p.waitForFunction(() => !/reading/i.test(document.querySelector('.mb-toolbar span:last-child')?.textContent ?? 'reading'), null, { timeout: LIMIT * 1000 });
  outcome = await p.locator('.mb-toolbar span').last().textContent();
} catch {}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const pass = outcome !== 'still reading';
console.log(`${pass ? 'PASS' : 'FAIL'}  ${secs}s  limit=${LIMIT}s  status="${outcome}"`);
await b.close();
process.exit(pass ? 0 : 1);
