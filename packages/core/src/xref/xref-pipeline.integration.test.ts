import { assert, expect, test } from "vitest";
import { ByteOffset } from "../pdf/types/byte-offset/index";
import { GenerationNumber } from "../pdf/types/generation-number/index";
import { ObjectNumber } from "../pdf/types/object-number/index";
import { scanStartXRef } from "./startxref/scanner/index";
import { parseXRefTable } from "./table/parser/index";
import { parseTrailer } from "./trailer/parser/index";

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

  const parseResult = parseXRefTable(data, scanResult.value);
  assert(parseResult.ok);

  expect(parseResult.value.xref.entries.size).toBe(2);
  expect(parseResult.value.xref.size).toBe(2);
  expect(parseResult.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(65535),
  });
  expect(parseResult.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
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

  const xrefResult = parseXRefTable(data, scanResult.value);
  assert(xrefResult.ok);

  const trailerResult = parseTrailer(data, xrefResult.value.trailerOffset);
  assert(trailerResult.ok);

  expect(trailerResult.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(trailerResult.value.size).toBe(2);
});
