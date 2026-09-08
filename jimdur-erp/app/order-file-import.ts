import type { Product } from "./jimdur-types";
import {
  cleanCell,
  matchOrderRows,
  rowsFromPositionedWords,
  rowsFromText,
  type ImportedOrderLine,
  type OrderFileImportResult,
  type RawRow,
} from "./order-row-matcher";
// The worker is copied to /public during `predev`/`prebuild` so Next.js and
// Vercel can serve it without Vite's `?url` import convention.
const pdfWorkerUrl = "/pdf.worker.min.mjs";

export { matchOrderRows };
export type { ImportedOrderLine, OrderFileImportResult };

type ProgressReporter = (message: string) => void;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 12;
const MAX_OCR_PAGES = 8;

async function spreadsheetRows(file: File) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellText: true,
    cellDates: false,
  });
  const rows: RawRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    for (const values of matrix) {
      const cells = values.map(cleanCell);
      const source = cells.filter(Boolean).join(" | ");
      if (source) rows.push({ cells, source });
    }
  }
  return rows;
}

async function wordRows(file: File) {
  const mammothModule = await import("mammoth");
  const mammoth = mammothModule.default;
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return rowsFromText(result.value);
}

async function ocrBlobs(
  blobs: Blob[],
  progress: ProgressReporter,
  pageSegMode: "6" | "11",
) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["spa", "eng"], undefined, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        progress(`Leyendo texto de la imagen… ${Math.round(message.progress * 100)}%`);
      }
    },
  });
  await worker.setParameters({
    // Sparse text preserves separate table columns much better in phone photos.
    // Tesseract exposes these enum values as strings at runtime ("6"/"11").
    tessedit_pageseg_mode: pageSegMode as Tesseract.PSM,
    preserve_interword_spaces: "1",
  });
  const rows: RawRow[] = [];
  try {
    for (let index = 0; index < blobs.length; index += 1) {
      progress(`Analizando imagen ${index + 1} de ${blobs.length}…`);
      const bitmap = await createImageBitmap(blobs[index]);
      const scale = Math.max(1, Math.min(3, 1800 / Math.max(bitmap.width, bitmap.height)));
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la imagen para lectura.");
      context.filter = "grayscale(1) contrast(1.45)";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const result = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const words = (result.data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.flatMap((line) =>
            line.words.map((word) => ({ text: word.text, ...word.bbox })),
          ),
        ),
      );
      rows.push(
        ...(words.length ? rowsFromPositionedWords(words) : rowsFromText(result.data.text)),
      );
    }
  } finally {
    await worker.terminate();
  }
  return rows;
}

function mergeImportResults(
  primary: OrderFileImportResult,
  secondary: OrderFileImportResult,
): OrderFileImportResult {
  const matched = new Map(primary.matched.map((line) => [line.productId, line]));
  for (const line of secondary.matched) {
    if (!matched.has(line.productId)) matched.set(line.productId, line);
  }
  return {
    matched: [...matched.values()],
    unmatched: [...new Set([...primary.unmatched, ...secondary.unmatched])].slice(0, 30),
    warnings: [...new Set([...primary.warnings, ...secondary.warnings])],
  };
}

async function matchPhotoRows(
  blobs: Blob[],
  products: Product[],
  progress: ProgressReporter,
) {
  const sparse = matchOrderRows(await ocrBlobs(blobs, progress, "11"), products);
  progress("Comprobando filas y columnas…");
  const table = matchOrderRows(await ocrBlobs(blobs, progress, "6"), products);
  return mergeImportResults(sparse, table);
}

async function pdfRows(
  file: File,
  products: Product[],
  progress: ProgressReporter,
) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  }).promise;
  const totalPages = document.numPages;
  const pageCount = Math.min(totalPages, MAX_PDF_PAGES);
  const rows: RawRow[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    progress(`Leyendo página ${pageNumber} de ${pageCount}…`);
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const grouped: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
    for (const item of content.items) {
      if (!("str" in item) || !cleanCell(item.str)) continue;
      const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
      const y = transform[5] ?? 0;
      let group = grouped.find((candidate) => Math.abs(candidate.y - y) <= 4);
      if (!group) {
        group = { y, items: [] };
        grouped.push(group);
      }
      group.items.push({ x: transform[4] ?? 0, text: cleanCell(item.str) });
    }
    for (const group of grouped.sort((a, b) => b.y - a.y)) {
      const cells = group.items.sort((a, b) => a.x - b.x).map((item) => item.text);
      const source = cells.join(" | ");
      if (source) rows.push({ cells, source });
    }
  }

  const textResult = matchOrderRows(rows, products);
  const warnings: string[] = [];
  if (totalPages > MAX_PDF_PAGES) {
    warnings.push(`Se revisaron las primeras ${MAX_PDF_PAGES} páginas del PDF.`);
  }
  const bracketedItems = rows.filter((row) =>
    /\[\s*(?:[|;]\s*)?\d+(?:[.,]\d+)*(?:\s*[|;])?\s*\]/.test(row.source),
  ).length;
  const shouldUseOcr =
    textResult.matched.length === 0 ||
    (bracketedItems >= 4 && textResult.matched.length < bracketedItems * 0.7);
  if (!shouldUseOcr) {
    await document.destroy();
    return { ...textResult, warnings };
  }

  const ocrPages = Math.min(totalPages, MAX_OCR_PAGES);
  const blobs: Blob[] = [];
  for (let pageNumber = 1; pageNumber <= ocrPages; pageNumber += 1) {
    progress(`Preparando página escaneada ${pageNumber} de ${ocrPages}…`);
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.7 });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob) blobs.push(blob);
  }
  await document.destroy();
  const ocrResult = await matchPhotoRows(blobs, products, progress);
  if (totalPages > MAX_OCR_PAGES) {
    warnings.push(`El OCR revisó las primeras ${MAX_OCR_PAGES} páginas.`);
  }
  return mergeImportResults(
    { ...textResult, warnings },
    { ...ocrResult, warnings: [...ocrResult.warnings, ...warnings] },
  );
}

export async function importOrderFile(
  file: File,
  products: Product[],
  progress: ProgressReporter,
): Promise<OrderFileImportResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("El archivo supera el límite de 15 MB.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  progress("Abriendo archivo…");

  if (["xlsx", "xls", "xlsm", "csv"].includes(extension)) {
    return matchOrderRows(await spreadsheetRows(file), products);
  }
  if (extension === "docx") {
    return matchOrderRows(await wordRows(file), products);
  }
  if (extension === "doc") {
    throw new Error("El formato .DOC antiguo no es compatible. Ábrelo en Word y guárdalo como .DOCX.");
  }
  if (extension === "pdf" || file.type === "application/pdf") {
    return pdfRows(file, products, progress);
  }
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return matchPhotoRows([file], products, progress);
  }
  throw new Error("Formato no compatible. Usa PDF, JPG, PNG, Excel o Word DOCX.");
}
