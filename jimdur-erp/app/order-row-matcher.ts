import type { Product } from "./jimdur-types";

export type ImportedOrderLine = {
  productId: number;
  code: string;
  name: string;
  quantity: number;
  source: string;
};

export type OrderFileImportResult = {
  matched: ImportedOrderLine[];
  unmatched: string[];
  warnings: string[];
};

export type RawRow = {
  cells: string[];
  source: string;
};

export type PositionedWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type QuantityLayout = {
  columnIndex: number;
  relativeToDescription: number | null;
  placement: "before" | "after" | null;
  wideFinancialTable: boolean;
  bracketStyle: boolean;
};

type ProductMatch = {
  product: Product;
  cellIndex: number;
  nameCellIndex: number;
  matchedCode: string;
};

const QUANTITY_HEADER = /^(CANTIDAD|CANT|QTY|UNIDADES|SOLICITADO|PEDIDO)$/;
const DESCRIPTION_HEADER = /^(DESCRIPCION|PRODUCTO|ARTICULO|ITEM)$/;

export function cleanCell(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return cleanCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeHeader(value: string) {
  return normalizeText(value).replace(/[.:]/g, "").trim();
}

function normalizeCode(value: string) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function comparableTokens(value: string) {
  return normalizeText(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 2 &&
        (!/^\d+$/.test(token) || token.length >= 3) &&
        !/^(?:IGV|TOTAL|PRECIO|UNIT|CANT|SOLES)$/.test(token),
    );
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  if (!longest || Math.abs(left.length - right.length) > Math.ceil(longest * 0.45)) {
    return 0;
  }
  return 1 - editDistance(left, right) / longest;
}

function fuzzyProductScore(row: string, product: Product) {
  const rowTokens = comparableTokens(row);
  const productTokens = comparableTokens(product.name);
  if (!rowTokens.length || !productTokens.length) return 0;

  const similarities = productTokens.map((token) =>
    Math.max(0, ...rowTokens.map((candidate) => tokenSimilarity(token, candidate))),
  );
  const strong = similarities.filter((score) => score >= 0.72).length;
  const weighted = similarities.reduce(
    (total, score, index) => total + score * productTokens[index].length,
    0,
  );
  const totalWeight = productTokens.reduce((total, token) => total + token.length, 0);
  const coverage = weighted / Math.max(1, totalWeight);
  const reverseSimilarities = rowTokens.map((token) =>
    Math.max(0, ...productTokens.map((candidate) => tokenSimilarity(token, candidate))),
  );
  const reverseStrong = reverseSimilarities.filter((score) => score >= 0.72).length;
  const reverseWeight = rowTokens.reduce((total, token) => total + token.length, 0);
  const reverseCoverage = reverseSimilarities.reduce(
    (total, score, index) => total + score * rowTokens[index].length,
    0,
  ) / Math.max(1, reverseWeight);
  const distinctive = productTokens.some(
    (token, index) => token.length >= 6 && similarities[index] >= 0.82,
  );
  const modelMatches = productTokens.filter(
    (token) =>
      /[A-Z]/.test(token) &&
      /\d/.test(token) &&
      rowTokens.some((candidate) => candidate === token),
  ).length;

  if (
    Math.max(strong, reverseStrong) < 2 &&
    !(distinctive && Math.max(coverage, reverseCoverage) >= 0.64)
  ) return 0;
  // Use the better directional coverage so catalog names and supplier documents
  // may abbreviate different parts of the same description.
  return Math.min(1, Math.max(coverage, reverseCoverage) + modelMatches * 0.1);
}

function modelTokenOverlap(row: string, product: Product) {
  const rowTokens = new Set(comparableTokens(row));
  return comparableTokens(product.name).filter(
    (token) => /[A-Z]/.test(token) && /\d/.test(token) && rowTokens.has(token),
  ).length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rowsFromText(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanCell)
    .filter(Boolean)
    .map((source) => {
      const split = source.includes("\t")
        ? source.split("\t")
        : source.includes("|")
          ? source.split("|")
          : source.includes(";")
            ? source.split(";")
            : [source];
      return {
        cells: split.map(cleanCell).filter(Boolean),
        source,
      };
    });
}

export function rowsFromPositionedWords(words: PositionedWord[]) {
  const groups: Array<{ center: number; height: number; words: PositionedWord[] }> = [];
  for (const word of words.filter((item) => cleanCell(item.text))) {
    const center = (word.y0 + word.y1) / 2;
    const height = Math.max(1, word.y1 - word.y0);
    let group = groups.find(
      (candidate) =>
        Math.abs(candidate.center - center) <= Math.max(3, Math.min(candidate.height, height) * 0.35),
    );
    if (!group) {
      group = { center, height, words: [] };
      groups.push(group);
    }
    group.words.push(word);
    const count = group.words.length;
    group.center = (group.center * (count - 1) + center) / count;
    group.height = Math.max(group.height, height);
  }

  return groups
    .sort((left, right) => left.center - right.center)
    .map((group) => {
      const cells = group.words
        .sort((left, right) => left.x0 - right.x0)
        .map((word) => cleanCell(word.text))
        .filter(Boolean);
      return { cells, source: cells.join(" ") };
    })
    .filter((row) => row.source);
}

function parseNumber(value: string) {
  let token = value.replace(/[^0-9,.-]/g, "");
  if (!token || !/\d/.test(token)) return null;
  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    token = token.replaceAll(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    const pieces = token.split(",");
    token =
      pieces.length > 2 || (pieces.length === 2 && pieces[1].length === 3)
        ? pieces.join("")
        : token.replace(",", ".");
  } else if ((token.match(/\./g) ?? []).length > 1) {
    token = token.replaceAll(".", "");
  }
  const parsed = Number(token);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function standaloneNumber(value: string) {
  const token = cleanCell(value)
    .replace(/^\[\s*|\s*\]$/g, "")
    .replace(/\s*(?:UND(?:\.|IDADES?)?|UNID(?:\.|ADES?)?|PCS?)$/i, "")
    .trim();
  if (!/^[+-]?\d[\d.,]*$/.test(token)) return null;
  return parseNumber(token);
}

function numbersWithPositions(value: string) {
  return [...value.matchAll(/\d+(?:[.,]\d+)*/g)]
    .map((match) => ({
      index: match.index ?? 0,
      value: parseNumber(match[0]),
    }))
    .filter(
      (item): item is { index: number; value: number } => item.value !== null,
    );
}

function numbersIn(value: string) {
  return numbersWithPositions(value).map((item) => item.value);
}

function quantityLayout(rows: RawRow[]): QuantityLayout {
  let placement: QuantityLayout["placement"] = null;
  const normalizedDocument = normalizeText(rows.slice(0, 60).map((row) => row.source).join(" "));
  const wideFinancialTable =
    /\b(?:IGV|1GV|I6V)\b/.test(normalizedDocument) &&
    /\bCANT\b/.test(normalizedDocument) &&
    /(?:V\s*VENTA|ICBPER)/.test(normalizedDocument);
  const bracketStyle = rows.filter((row) => /^\s*\[\s*\d+(?:[.,]\d+)?\s*\]/.test(row.source)).length >= 1;

  for (const row of rows.slice(0, 40)) {
    const quantityIndex = row.cells.findIndex((cell) =>
      QUANTITY_HEADER.test(normalizeHeader(cell)),
    );
    const descriptionIndex = row.cells.findIndex((cell) =>
      DESCRIPTION_HEADER.test(normalizeHeader(cell)),
    );
    if (quantityIndex >= 0) {
      return {
        columnIndex: quantityIndex,
        relativeToDescription:
          descriptionIndex >= 0 ? quantityIndex - descriptionIndex : null,
        placement:
          descriptionIndex < 0
            ? placement
            : quantityIndex < descriptionIndex
              ? "before"
              : "after",
        wideFinancialTable,
        bracketStyle,
      };
    }

    const normalized = normalizeText(row.source);
    const quantityMatch = normalized.match(
      /\b(?:CANTIDAD|CANT|QTY|UNIDADES|SOLICITADO|PEDIDO)\b/,
    );
    const descriptionMatch = normalized.match(
      /\b(?:DESCRIPCION|PRODUCTO|ARTICULO|ITEM)\b/,
    );
    if (
      quantityMatch?.index !== undefined &&
      descriptionMatch?.index !== undefined
    ) {
      placement = quantityMatch.index < descriptionMatch.index ? "before" : "after";
    }
  }

  return {
    columnIndex: -1,
    relativeToDescription: null,
    placement,
    wideFinancialTable,
    bracketStyle,
  };
}

function productNameCell(product: Product, normalizedCells: string[]) {
  const name = normalizeText(product.name);
  return normalizedCells.findIndex((cell) => cell.includes(name));
}

function findProduct(row: RawRow, products: Product[]): ProductMatch | null {
  const normalizedCells = row.cells.map(normalizeText);
  const normalizedRow = normalizeText(row.source);
  const collapsedRow = normalizeCode(row.source);
  const byCode = products
    .flatMap((product) =>
      [product.code, product.supplierCode]
        .filter(Boolean)
        .map((code) => ({
          product,
          code: normalizeCode(code),
        })),
    )
    .filter((entry) => entry.code.length >= 3)
    .sort((left, right) => right.code.length - left.code.length);

  for (const entry of byCode) {
    const exactCell = normalizedCells.findIndex(
      (cell) => normalizeCode(cell) === entry.code,
    );
    const nameCellIndex = productNameCell(entry.product, normalizedCells);
    if (exactCell >= 0) {
      return {
        product: entry.product,
        cellIndex: nameCellIndex >= 0 ? nameCellIndex : exactCell,
        nameCellIndex,
        matchedCode: entry.code,
      };
    }
    const boundary = new RegExp(
      `(^|[^A-Z0-9])${escapeRegExp(entry.code)}(?=$|[^A-Z0-9])`,
    );
    if (
      boundary.test(normalizedRow) ||
      (entry.code.length >= 6 && collapsedRow.includes(entry.code))
    ) {
      const codeCellIndex = normalizedCells.findIndex((cell) =>
        normalizeCode(cell).includes(entry.code),
      );
      return {
        product: entry.product,
        cellIndex: nameCellIndex >= 0 ? nameCellIndex : codeCellIndex,
        nameCellIndex,
        matchedCode: entry.code,
      };
    }
  }

  const byName = products
    .map((product) => ({ product, name: normalizeText(product.name) }))
    .filter((entry) => entry.name.length >= 8)
    .sort((left, right) => right.name.length - left.name.length);
  const found = byName.find((entry) => normalizedRow.includes(entry.name));
  const fuzzy = found
    ? null
    : products
        .map((product) => ({
          product,
          score: fuzzyProductScore(row.source, product),
          models: modelTokenOverlap(row.source, product),
        }))
        .filter((entry) => entry.score >= 0.58)
        .sort((left, right) => right.models - left.models || right.score - left.score);
  const selected = found?.product ?? fuzzy?.[0]?.product;
  if (!selected) return null;
  if (
    fuzzy &&
    fuzzy.length > 1 &&
    fuzzy[0].models === fuzzy[1].models &&
    fuzzy[0].score - fuzzy[1].score < 0.08
  ) return null;
  const selectedName = normalizeText(selected.name);
  const nameCellIndex = normalizedCells.findIndex((cell) =>
    cell.includes(selectedName),
  );
  return {
    product: selected,
    cellIndex: nameCellIndex >= 0 ? nameCellIndex : 0,
    nameCellIndex,
    matchedCode: "",
  };
}

function bracketQuantity(value: string) {
  // PDF.js often returns the three visual pieces as "[ | 5.00 | ]".
  // Permit harmless column separators between the brackets and the number.
  const match = value.match(/\[\s*(?:[|;]\s*)?(\d+(?:[.,]\d+)*)(?:\s*[|;])?\s*\]/);
  return match ? parseNumber(match[1]) : null;
}

function lineTotalMatches(quantity: number, unitPrice: number, total: number) {
  const expected = quantity * unitPrice;
  return Math.abs(expected - total) <= Math.max(0.05, Math.abs(total) * 0.005);
}

function chooseQuantity(
  before: number[],
  after: number[],
  placement: QuantityLayout["placement"],
) {
  if (placement === "before" && before.length) {
    return before[before.length - 1];
  }
  if (placement === "after" && after.length) return after[0];

  const beforeCandidate = before[before.length - 1];
  if (
    beforeCandidate !== undefined &&
    after.length >= 2 &&
    lineTotalMatches(beforeCandidate, after[0], after[1])
  ) {
    return beforeCandidate;
  }
  if (
    after.length >= 3 &&
    lineTotalMatches(after[0], after[1], after[2])
  ) {
    return after[0];
  }

  if (after.length >= 3) return after[0];
  if (before.length && after.length === 2) return beforeCandidate;
  if (after.length === 1) return after[0];
  if (before.length) return beforeCandidate;
  return after[0] ?? null;
}

function quantityFromHeader(
  row: RawRow,
  layout: QuantityLayout,
  match: ProductMatch,
) {
  const indexes: number[] = [];
  if (match.nameCellIndex >= 0 && layout.relativeToDescription !== null) {
    indexes.push(match.nameCellIndex + layout.relativeToDescription);
  }
  if (layout.columnIndex >= 0) indexes.push(layout.columnIndex);

  for (const index of [...new Set(indexes)]) {
    if (index < 0 || !row.cells[index]) continue;
    const quantity = standaloneNumber(row.cells[index]);
    if (quantity !== null) return quantity;
  }
  return null;
}

function quantityAroundProduct(row: RawRow, match: ProductMatch) {
  const anchor = match.cellIndex;
  if (anchor >= 0 && row.cells.length > 1) {
    const before = row.cells
      .slice(0, anchor)
      .map(standaloneNumber)
      .filter((item): item is number => item !== null);
    const after = row.cells
      .slice(anchor + 1)
      .map(standaloneNumber)
      .filter((item): item is number => item !== null);
    if (before.length || after.length) return { before, after };
  }

  const normalizedRow = normalizeText(row.source);
  const normalizedName = normalizeText(match.product.name);
  const nameIndex = normalizedRow.indexOf(normalizedName);
  if (nameIndex >= 0) {
    const tokens = numbersWithPositions(normalizedRow);
    return {
      before: tokens
        .filter((token) => token.index < nameIndex)
        .map((token) => token.value),
      after: tokens
        .filter((token) => token.index >= nameIndex + normalizedName.length)
        .map((token) => token.value),
    };
  }

  let remainder = normalizedRow;
  if (match.matchedCode) remainder = remainder.replaceAll(match.matchedCode, " ");
  remainder = remainder.replace(normalizedName, " ");
  return { before: [] as number[], after: numbersIn(remainder) };
}

function findQuantity(
  row: RawRow,
  layout: QuantityLayout,
  match: ProductMatch,
) {
  const bracketed = bracketQuantity(row.source);
  if (bracketed !== null) return bracketed;

  const fromHeader = quantityFromHeader(row, layout, match);
  if (fromHeader !== null) return fromHeader;

  const values = numbersIn(row.source);
  if (layout.wideFinancialTable && values.length >= 5) {
    const candidate = values[values.length - 5];
    if (candidate > 0 && candidate <= 10000) return candidate;
  }

  const moneyValues = [...row.source.matchAll(/\d+[.,]\d{2}/g)]
    .map((moneyMatch) => parseNumber(moneyMatch[0]))
    .filter((value): value is number => value !== null);
  if (moneyValues.length >= 2) {
    const unitPrice = moneyValues[moneyValues.length - 2];
    const total = moneyValues[moneyValues.length - 1];
    const inferred = total / unitPrice;
    const rounded = Math.round(inferred * 100) / 100;
    if (rounded > 0 && rounded <= 10000 && Math.abs(inferred - rounded) <= 0.02) {
      return rounded;
    }
  }

  if (layout.bracketStyle && match.nameCellIndex < 0) return null;

  if (match.nameCellIndex < 0) {
    for (let index = 0; index <= values.length - 3; index += 1) {
      if (lineTotalMatches(values[index], values[index + 1], values[index + 2])) {
        return values[index];
      }
    }
  }

  const aroundProduct = quantityAroundProduct(row, match);
  return chooseQuantity(
    aroundProduct.before,
    aroundProduct.after,
    layout.placement,
  );
}

export function matchOrderRows(rows: RawRow[], products: Product[]) {
  const activeProducts = products.filter((product) => product.active);
  const layout = quantityLayout(rows);
  const matched = new Map<number, ImportedOrderLine>();
  const unmatched: string[] = [];

  const logicalRows: RawRow[] = [];
  for (const row of rows) {
    const beginsBracketItem = /^\s*\[?\s*\d+(?:[.,]\d+)?\s*\]/.test(row.source);
    const hasMonetaryTail = /\d+[.,]\d{2}\D+\d+[.,]\d{2}\s*$/.test(row.source);
    const beginsLineItem = beginsBracketItem || hasMonetaryTail;
    const previous = logicalRows[logicalRows.length - 1];
    const previousIsLineItem = previous && (
      /^\s*\[?\s*\d+(?:[.,]\d+)?\s*\]/.test(previous.source) ||
      /\d+[.,]\d{2}\D+\d+[.,]\d{2}(?:\s|$)/.test(previous.source)
    );
    const continuation =
      previousIsLineItem &&
      !beginsLineItem &&
      !/^(?:DOCUMENTO|CLIENTE|MONEDA|FECHA|GRAVADO|TOTAL|I\.?G\.?V|USUARIO|CONDICI)/i.test(row.source);
    if (continuation) {
      previous.source += " " + row.source;
      previous.cells = [previous.source];
    } else {
      logicalRows.push({ cells: [...row.cells], source: row.source });
    }
  }

  for (const row of logicalRows) {
    if (!row.source || row.source.length < 2) continue;
    const productMatch = findProduct(row, activeProducts);
    if (!productMatch) {
      if (
        /\d/.test(row.source) &&
        !/CANTIDAD|DESCRIPCI[ÓO]N|PRODUCTO/i.test(row.source)
      ) {
        unmatched.push(row.source);
      }
      continue;
    }
    const quantity = findQuantity(row, layout, productMatch);
    if (quantity === null) {
      unmatched.push(row.source);
      continue;
    }
    const current = matched.get(productMatch.product.id);
    matched.set(productMatch.product.id, {
      productId: productMatch.product.id,
      code: productMatch.product.code,
      name: productMatch.product.name,
      quantity: (current?.quantity ?? 0) + quantity,
      source: current ? current.source + " | " + row.source : row.source,
    });
  }

  return {
    matched: [...matched.values()],
    unmatched: [...new Set(unmatched)].slice(0, 30),
    warnings: [] as string[],
  };
}
