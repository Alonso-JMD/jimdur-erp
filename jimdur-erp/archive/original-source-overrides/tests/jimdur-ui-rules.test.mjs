import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/JimdurApp.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const serverUrl = new URL("../app/jimdur-server.ts", import.meta.url);
const orderImportUrl = new URL("../app/order-file-import.ts", import.meta.url);

test("uses JIMDUR dialogs instead of browser confirmation messages", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\s*\(/);
  assert.match(source, /function ActionDialog\s*\(/);
  assert.match(source, /role="alertdialog"/);
});

test("treats active products below 15 units as critical stock", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const CRITICAL_STOCK_LIMIT = 15;/);
  assert.match(
    source,
    /product\.active && product\.available < CRITICAL_STOCK_LIMIT/,
  );
});

test("shows the complete synchronization date and time in the header", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /second: "2-digit"/);
  assert.match(source, /Actualizado: \{fullDateTime\(snapshot\.generatedAt\)\}/);
});

test("keeps every Kardex date and time complete on one line", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    source,
    /<td className="date-time-cell">\{dateTime\(row\.date\)\}<\/td>/,
  );
  assert.match(
    styles,
    /\.date-time-cell\s*\{[^}]*min-width:\s*142px;[^}]*white-space:\s*nowrap;/s,
  );
});

test("uses a legible professional density for operational tables", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /table\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(styles, /th\s*\{[^}]*font-size:\s*9px;/s);
  assert.match(styles, /td\s*\{[^}]*padding:\s*11px 10px;/s);
  assert.match(styles, /\.filter-bar input,[\s\S]*font-size:\s*12px;/);
});

test("provides professional icon navigation without dashboard quick access", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /function AppIcon\s*\(/);
  assert.match(source, /const MOBILE_NAV_ITEMS/);
  assert.doesNotMatch(source, /className="dashboard-quick-section"/);
  assert.doesNotMatch(source, /ACCESOS RÁPIDOS/);
  assert.match(source, /className="mobile-bottom-nav"/);
  assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*\.mobile-bottom-nav\s*\{/);
});

test("adds quick report ranges and accessible operation messages", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /ÚLTIMOS 7 DÍAS/);
  assert.match(source, /className="report-summary-strip"/);
  assert.match(source, /aria-live=\{noticeIsError \? "assertive" : "polite"\}/);
  assert.match(source, /role=\{noticeIsError \? "alert" : "status"\}/);
});

test("lets stock adjustments use every active catalog product", async () => {
  const [source, server] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(serverUrl, "utf8"),
  ]);

  assert.match(
    source,
    /snapshot\.products\.filter\(\(item\) => item\.active\)\.map/,
  );
  assert.match(source, /ALMACÉN[\s\S]*activeWarehouses\.map/);
  assert.match(
    server,
    /INSERT INTO stock \(product_id,warehouse_id,physical,reserved,damaged\)[\s\S]*ON CONFLICT\(product_id,warehouse_id\) DO UPDATE SET physical=excluded\.physical/,
  );
});

test("shows only products with physical stock in inventory", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(
    source,
    /return snapshot\.stock\.filter\([\s\S]*row\.physical > 0 &&/,
  );
  assert.match(source, /<span>productos con stock<\/span>/);
});

test("shows only products with physical stock in stock adjustments", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(
    source,
    /function AdjustmentsView[\s\S]*snapshot\.stock\.filter\(\(row\) => row\.physical > 0\)/,
  );
  assert.match(source, /<StockTable rows=\{stockedRows\} \/>/);
});

test("generates compact receipt and order correlatives", async () => {
  const [source, server] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(serverUrl, "utf8"),
  ]);

  assert.match(server, /nextNumber\("receipts", "REC", false\)/);
  assert.match(server, /nextNumber\("orders", "OS", false\)/);
  assert.match(source, /function compactOperationalNumber\s*\(/);
  assert.match(source, /compactOperationalNumber\(receipt\.number\)/);
  assert.match(source, /compactOperationalNumber\(order\.number\)/);
});

test("keeps the proforma document as a manual field", async () => {
  const [source, server] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(serverUrl, "utf8"),
  ]);

  assert.match(
    server,
    /asText\(payload\.client\)\.toUpperCase\(\),\s*asText\(payload\.document\)\.toUpperCase\(\),\s*asText\(payload\.address\)/s,
  );
  assert.doesNotMatch(source, /DOCUMENTO AUTOMÁTICO/);
  assert.match(source, /<label>DOCUMENTO<input value=\{form\.document\}/);
});

test("uses AS correlatives and updates historical document numbers", async () => {
  const [source, server] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(serverUrl, "utf8"),
  ]);

  assert.match(server, /async function nextAdjustmentNumber\s*\(/);
  assert.match(server, /return "AS-" \+ String\(asNumber\(row\?\.sequence, 1\)\)\.padStart\(6, "0"\)/);
  assert.match(server, /UPDATE receipts SET number='REC-' \|\| SUBSTR\(number,-6\)/);
  assert.match(server, /UPDATE orders SET number='OS-' \|\| SUBSTR\(number,-6\)/);
  assert.doesNotMatch(server, /\bGLOB\b/);
  assert.match(source, /compactOperationalNumber\(row\.document\)/);
});

test("imports order products from office files, PDFs, and photos", async () => {
  const [source, importer, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(orderImportUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /function OrderFileImporter\s*\(/);
  assert.match(source, /<OrderFileImporter/);
  assert.match(source, /PDF, foto, Excel o Word/);
  assert.match(importer, /await import\("xlsx"\)/);
  assert.match(importer, /await import\("mammoth"\)/);
  assert.match(importer, /await import\("pdfjs-dist"\)/);
  assert.match(importer, /await import\("tesseract\.js"\)/);
  assert.match(styles, /\.order-file-import\s*\{/);
});

test("forces installed clients to update the document reader", async () => {
  const [source, installer, worker] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(new URL("../app/instalar/InstallMobile.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/service-worker.js", import.meta.url), "utf8"),
  ]);

  assert.match(source, /service-worker\.js\?v=5/);
  assert.match(source, /Lector v5/);
  assert.match(installer, /service-worker\.js\?v=5/);
  assert.match(worker, /jimdur-shell-v5/);
});

test("shows complete operational dates on one line", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /function dateOnly\s*\(/);
  assert.match(source, /dateOnly\(receipt\.date\)/);
  assert.match(source, /dateOnly\(order\.date\)/);
  assert.match(
    styles,
    /\.date-only-cell\s*\{[^}]*min-width:\s*92px;[^}]*white-space:\s*nowrap;/s,
  );
});
