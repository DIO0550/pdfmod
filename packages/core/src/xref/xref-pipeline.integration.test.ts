import { assert, expect, test } from "vitest";
import type { ByteOffset } from "../types/index.js";
import { scanStartXRef } from "./startxref/startxref-scanner.js";
import { parseXRefTable } from "./table/xref-table-parser.js";
import { parseTrailer } from "./trailer/trailer-parser.js";

test("scanStartXRefの結果をparseXRefTableに渡してend-to-endで解析する", () => {
  const pdf =
    "%PDF-1.7\n" +
    "xref\n" +
    "0 2\n" +
    "0000000000 65535 f\r\n" +
    "0000000009 00000 n\r\n" +
    "trailer\n" +
    "<< /Size 2 >>\n" +
    "startxref\n" +
    "9\n" +
    "%%EOF\n";

  const data = new TextEncoder().encode(pdf);

  const scanResult = scanStartXRef(data);
  assert(scanResult.ok);

  const parseResult = parseXRefTable(data, scanResult.value as ByteOffset);
  assert(parseResult.ok);

  expect(parseResult.value.xref.entries.size).toBe(2);
  expect(parseResult.value.xref.size).toBe(2);
  expect(parseResult.value.xref.entries.get(0)).toEqual({
    type: 0,
    field2: 0,
    field3: 65535,
  });
  expect(parseResult.value.xref.entries.get(1)).toEqual({
    type: 1,
    field2: 9,
    field3: 0,
  });
});

test("scanStartXRef -> parseXRefTable -> parseTrailerのend-to-endパイプライン", () => {
  const pdf =
    "%PDF-1.7\n" +
    "xref\n" +
    "0 2\n" +
    "0000000000 65535 f\r\n" +
    "0000000009 00000 n\r\n" +
    "trailer\n" +
    "<< /Root 1 0 R /Size 2 >>\n" +
    "startxref\n" +
    "9\n" +
    "%%EOF\n";

  const data = new TextEncoder().encode(pdf);

  const scanResult = scanStartXRef(data);
  assert(scanResult.ok);

  const xrefResult = parseXRefTable(data, scanResult.value as ByteOffset);
  assert(xrefResult.ok);

  const trailerResult = parseTrailer(data, xrefResult.value.trailerOffset);
  assert(trailerResult.ok);

  expect(trailerResult.value.root).toEqual({
    objectNumber: 1,
    generationNumber: 0,
  });
  expect(trailerResult.value.size).toBe(2);
});
