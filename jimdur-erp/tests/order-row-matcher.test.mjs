import assert from "node:assert/strict";
import test from "node:test";

import {
  matchOrderRows,
  rowsFromPositionedWords,
  rowsFromText,
} from "../app/order-row-matcher.ts";

function product(id, name, code = String(id).padStart(8, "0")) {
  return {
    id,
    code,
    supplierCode: "",
    name,
    brand: "",
    application: "",
    unit: "UND",
    location: "",
    cost: 0,
    minimum: 0,
    active: true,
    physical: 0,
    reserved: 0,
    damaged: 0,
    available: 0,
  };
}

test("reads a bracketed quantity before the product instead of the line total", () => {
  const products = [product(1, "COMANDO DERECHO GL 70/DAYOCHI")];
  const rows = [
    { cells: ["DESCRIPCIÓN", "P/U", "TOTAL"], source: "DESCRIPCIÓN | P/U | TOTAL" },
    {
      cells: ["[5.00]", "COMANDO DERECHO GL 70/DAYOCHI", "7.80", "39.00"],
      source: "[5.00] | COMANDO DERECHO GL 70/DAYOCHI | 7.80 | 39.00",
    },
  ];

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 5);
});

test("reads a bracket quantity split into PDF text fragments", () => {
  const products = [product(12, "CILINDRO C110 KIGCOL")];
  const rows = [
    {
      cells: ["[", "3.00", "]", "CILINDRO C110 KIGCOL", "47.00", "141.00"],
      source: "[ | 3.00 | ] | CILINDRO C110 KIGCOL | 47.00 | 141.00",
    },
  ];

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 3);
});

test("reads the CANT. column after the product in a wide proforma", () => {
  const products = [product(2, "SELENIO C150 KIGCOL")];
  const rows = [
    {
      cells: ["IGV", "DESCRIPCIÓN", "CANT.", "P. UNIT.", "TOTAL", "ICBPER", "V. VENTA"],
      source: "IGV | DESCRIPCIÓN | CANT. | P. UNIT. | TOTAL | ICBPER | V. VENTA",
    },
    {
      cells: ["8.38", "SELENIO C150 KIGCOL", "5.00", "10.99", "54.95", "0.00", "46.57"],
      source: "8.38 | SELENIO C150 KIGCOL | 5.00 | 10.99 | 54.95 | 0.00 | 46.57",
    },
  ];

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 5);
});

test("infers the quantity after the product from OCR text", () => {
  const products = [product(3, "MONOSHOCK 305MM XR125 KIGCOL")];
  const rows = rowsFromText(
    "IGV DESCRIPCIÓN CANT. P. UNIT. TOTAL ICBPER V. VENTA\n" +
      "78.67 MONOSHOCK 305MM XR125 KIGCOL 5.00 103.14 515.70 0.00 437.03",
  );

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 5);
});

test("infers an unbracketed quantity before the product using price times quantity", () => {
  const products = [product(4, "RODAJE SCP 6202")];
  const rows = rowsFromText("20.00 RODAJE SCP 6202 2.05 41.00");

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 20);
});

test("joins wrapped descriptions from narrow photographed documents", () => {
  const products = [product(5, "COMANDO DERECHO GL 70/DAYOCHI")];
  const rows = rowsFromText(
    "DESCRIPCION P/U TOTAL\n" +
      "[5.00] COMANDO DERECHO GL 7.80 39.00\n" +
      "70/DAYOCHI\n" +
      "[20.00] OTRO PRODUCTO 2.00 40.00",
  );

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 5);
});

test("tolerates common OCR errors in a product description", () => {
  const products = [product(6, "ESPEJO RETROVISOR ROMBO VOLDA")];
  const rows = rowsFromText(
    "IGV DESCRIPCION CANT. P.UNIT TOTAL\n" +
      "7.23 ESPEJO RERMOVISOR ROMO VOLDA 6.00 7.90 47.40",
  );

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 6);
});

test("never uses IGV as quantity when OCR flattens a wide proforma", () => {
  const products = [product(7, "MONOSHOCK 305MM XR125 KIGCOL")];
  const rows = rowsFromText(
    "IGV DESCRIPCION CANT. P.UNIT. TOTAL ICBPER V. VENTA\n" +
      "78.67 MONOSHOCK 305MM XR125 KIGCOL 5.00 103.14 515.70 0.00 437.03",
  );

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 5);
});

test("recognizes a wide proforma when OCR reads IGV as 1GV", () => {
  const products = [
    product(10, "MONOSHOCK 305MM XR125 KIGCOL"),
    product(11, "PASTILLAS FRENO DELANTERO PAR - TZHY-160/180/200 COMPATIBLE CON APACHE-18"),
  ];
  const rows = rowsFromText(
    "1GV DESCRIPCION CANT. P.UNIT. TOTAL ICBPER V. VENTA\n" +
      "78.67 MONOSHOCK 305MM XR125 KIGCOL 5.00 103.14 515.70 0.00 437.03\n" +
      "4.76 PASTILLAS FRENO DELANTERO PAR - TZHY-160/180/200 COMPATIBLE CON APACHE-18 6.00 5.20 31.20 0.00 26.44",
  );

  const result = matchOrderRows(rows, products);
  assert.equal(result.matched.find((line) => line.productId === 10)?.quantity, 5);
  assert.equal(result.matched.find((line) => line.productId === 11)?.quantity, 6);
});

test("infers a damaged bracket quantity from unit price and total", () => {
  const products = [
    product(8, "ALTERNADOR 125/150 KIGCOL"),
    product(9, "RODAJE SCP 6004"),
  ];
  const rows = rowsFromText(
    "DESCRIPCION P/U TOTAL\n" +
      "[5.00] RODAJE SCP 6004 3.10 15.50\n" +
      "[RQO,MTERNADOR 125/150 25.04 125.20\n" +
      "KIGCOL",
  );

  const result = matchOrderRows(rows, products);
  const alternator = result.matched.find((line) => line.productId === 8);
  assert.equal(alternator?.quantity, 5);
});

test("rebuilds photographed table rows from OCR word coordinates", () => {
  const words = [
    ["8.38", 8, 100, 38, 116],
    ["SELENIO", 75, 101, 132, 117],
    ["C150", 137, 101, 171, 117],
    ["KIGCOL", 176, 101, 225, 117],
    ["5.00", 350, 100, 382, 116],
    ["10.99", 410, 100, 449, 116],
    ["54.95", 475, 100, 514, 116],
    ["0.00", 545, 100, 577, 116],
    ["46.57", 625, 100, 664, 116],
  ].map(([text, x0, y0, x1, y1]) => ({ text, x0, y0, x1, y1 }));
  const rows = [
    ...rowsFromText("IGV DESCRIPCION CANT. P.UNIT. TOTAL ICBPER V. VENTA"),
    ...rowsFromPositionedWords(words),
  ];
  const result = matchOrderRows(rows, [product(20, "SELENIO C150 KIGCOL")]);
  assert.equal(result.matched[0]?.quantity, 5);
});

test("matches an abbreviated supplier description to a longer catalog name", () => {
  const products = [
    product(30, "CAJA DE FILTRO AIRE COMPLETA WX150 WY125 HONGJU"),
  ];
  const rows = rowsFromText(
    "[3.00] CAJA DE FILTRO DE AIRE 19.55 58.65\nWX150/WY125-HONGJU",
  );
  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 3);
});

test("keeps model numbers when distinguishing similar products", () => {
  const products = [
    product(31, "CILINDRO COMPLETO CG150 KIGCOL"),
    product(32, "CILINDRO COMPLETO CG200 KIGCOL 196CC"),
  ];
  const rows = rowsFromText(
    "[3.00] CILINDRO COMPLETO 91.00 273.00\nCG200 KIGCOL 196CC",
  );
  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.productId, 32);
});

test("recognizes the remaining products from the narrow phone photo", () => {
  const products = [
    product(40, "RODAJE CONICO CG/GL 320/22.5-320/24 KIGCOL"),
    product(41, "ALTERNADOR 125/150 KIGCOL"),
    product(42, "CREMALLERA SOLA CG125 KIGCOL"),
    product(43, "COMANDO IZQUIERDO LUCES BOTON ESTACIONAMIENTO VOLDA"),
  ];
  const rows = rowsFromText(
    "[10.00] RODAJE CONICO CG/GL 6.99 69.90 320/22.5-320/24 KIGCOL\n" +
      "[5.00] ALTERNADOR 125/150 25.04 125.20 KIGCOL\n" +
      "[5.00] CREMALLERA SOLA 23.50 117.50 CG125 KIGCOL\n" +
      "[5.00] COMANDO IZQUIERDO 14.19 70.95 LUCES BOTON ESTACIONAMIENTO VOLDA",
  );
  const result = matchOrderRows(rows, products);
  assert.deepEqual(
    result.matched.map((line) => [line.productId, line.quantity]),
    [[40, 10], [41, 5], [42, 5], [43, 5]],
  );
});

test("does not merge adjacent photographed table lines", () => {
  const words = [
    ["PORTAMANIJA", 70, 100, 170, 124], ["EMBRAGUE", 175, 100, 245, 124],
    ["12.00", 350, 100, 390, 124], ["5.49", 420, 100, 452, 124],
    ["OJO", 70, 117, 95, 141], ["DE", 100, 117, 118, 141],
    ["AGUILA", 123, 117, 173, 141], ["VERDE", 178, 117, 223, 141],
    ["3.00", 350, 117, 382, 141], ["9.30", 420, 117, 452, 141],
  ].map(([text, x0, y0, x1, y1]) => ({ text, x0, y0, x1, y1 }));
  assert.equal(rowsFromPositionedWords(words).length, 2);
});

test("does not calculate 1.25 from the 4P and 5 in a product name", () => {
  const products = [
    product(50, "PLATO PRESOR/CENTRAL DE EMBRAGUE 4P 5 KIGCOL"),
  ];
  const rows = rowsFromText(
    "DESCRIPCION P/U TOTAL\n" +
      "PLATO PRESOR/CENTRAL DE EMBRAGUE 4P 5 KIGCOL",
  );
  const result = matchOrderRows(rows, products);
  assert.equal(result.matched.length, 0);
});

test("infers quantity only from the real unit price and line total", () => {
  const products = [
    product(51, "PLATO PRESOR/CENTRAL DE EMBRAGUE 4P 5 KIGCOL"),
  ];
  const rows = rowsFromText(
    "DESCRIPCION P/U TOTAL\n" +
      "PLATO PRESOR/CENTRAL DE EMBRAGUE 4P 5 KIGCOL 14.60 73.00",
  );
  const result = matchOrderRows(rows, products);
  assert.equal(result.matched[0]?.quantity, 5);
});
