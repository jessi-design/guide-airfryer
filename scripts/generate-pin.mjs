// Génère l'image d'une épingle Pinterest (1000x1500) à partir d'un gabarit HTML
// (voir pin-templates.mjs), rendue via Chromium headless (Playwright).

import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPinHtml, COLORWAY_NAMES } from './pin-templates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(__dirname, '..', 'assets', 'fonts', 'Pacifico-Regular.ttf');

export async function generatePinImage({ index, badge, title, subtitle, siteUrl, photoUrl, outPath }) {
  const layout = index % 3;
  const colorway = COLORWAY_NAMES[index % COLORWAY_NAMES.length];

  const fontBase64 = (await fs.readFile(FONT_PATH)).toString('base64');
  const html = buildPinHtml({ layout, colorway, badge, title, subtitle, siteUrl, photoUrl, fontBase64 });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1500 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }

  return { layout, colorway };
}
