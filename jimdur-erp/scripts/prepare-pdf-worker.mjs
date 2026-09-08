import { copyFile } from "node:fs/promises";

const source = new URL(
  "../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
);
const destination = new URL("../public/pdf.worker.min.mjs", import.meta.url);

await copyFile(source, destination);
console.log("PDF.js worker preparado en public/pdf.worker.min.mjs");
