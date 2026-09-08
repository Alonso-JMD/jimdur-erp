import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("genera el artefacto Next.js para Vercel", async () => {
  await assert.doesNotReject(access(new URL("../.next/BUILD_ID", import.meta.url)));
  const buildId = await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8");
  assert.ok(buildId.trim().length > 0);
});

test("incluye el worker PDF público", async () => {
  const worker = await readFile(
    new URL("../public/pdf.worker.min.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(worker.length > 1000);
});
