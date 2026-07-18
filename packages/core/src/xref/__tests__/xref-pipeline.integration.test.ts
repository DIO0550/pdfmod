import { assert, expect, test } from "vitest";
import { ObjectParser } from "../../objects/object-parser/index";
import type { PdfParseError } from "../../pdf/errors/index";
import { ByteOffset } from "../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../pdf/types/generation-number/index";
import type { PdfValue, TrailerDict, XRefTable } from "../../pdf/types/index";
import { ObjectNumber } from "../../pdf/types/object-number/index";
import type { Result } from "../../utils/result/index";
import { flatMap, ok } from "../../utils/result/index";
import { scanFallback } from "../fallback/index";
import { mergeXRefChain } from "../merger/index";
import { scanStartXRef } from "../startxref/scanner/index";
import {
  buildXRefStreamTrailerDict,
  decodeXRefStreamEntries,
  decompressFlate,
} from "../stream/index";
import { parseXRefTable } from "../table/parser/index";
import { parseTrailer } from "../trailer/parser/index";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function pdfIntArray(value: PdfValue | undefined): number[] {
  assert(value !== undefined && value.type === "array");
  return value.elements.map((el) => {
    assert(el.type === "integer");
    return el.value;
  });
}

function pdfInt(value: PdfValue | undefined): number {
  assert(value !== undefined && value.type === "integer");
  return value.value;
}

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

test("scanStartXRef -> parseIndirectObject -> decompressFlate -> decodeXRefStreamEntries -> buildXRefStreamTrailerDictのend-to-endパイプライン（xrefストリーム経路）", async () => {
  // 解凍後の生エントリ: obj0=free(nextFree=0,gen=0) obj1=used(offset=9,gen=0) obj2=used(offset=74,gen=0)
  // zlib.deflateSync(Buffer.from([0,0,0,0, 1,0,9,0, 1,0,74,0])) の結果
  const compressed = new Uint8Array([
    120, 156, 99, 96, 96, 96, 96, 100, 224, 100, 96, 100, 240, 98, 0, 0, 0, 226,
    0, 86,
  ]);

  const header = "%PDF-1.7\n";
  const objOffset = header.length;
  const objHeader =
    "7 0 obj\n" +
    `<< /Type /XRef /Filter /FlateDecode /W [1 2 1] /Size 3 /Root 1 0 R /Length ${compressed.length} >>\n` +
    "stream\n";
  const footer = `startxref\n${objOffset}\n%%EOF\n`;

  const data = concatBytes([
    encode(header),
    encode(objHeader),
    compressed,
    encode("\nendstream\nendobj\n"),
    encode(footer),
  ]);

  const scanResult = scanStartXRef(data);
  assert(scanResult.ok);
  expect(scanResult.value).toBe(objOffset);

  const objectResult = await ObjectParser.parseIndirectObject(
    data,
    scanResult.value,
  );
  assert(objectResult.ok);
  assert(objectResult.value.body.type === "stream");
  const stream = objectResult.value.body;

  const decompressResult = await decompressFlate(stream.data);
  assert(decompressResult.ok);

  const w = pdfIntArray(stream.dictionary.entries.get("W"));
  const size = pdfInt(stream.dictionary.entries.get("Size"));

  const xrefResult = decodeXRefStreamEntries({
    data: decompressResult.value,
    w: [w[0], w[1], w[2]],
    size,
  });
  assert(xrefResult.ok);

  expect(xrefResult.value.size).toBe(3);
  expect(xrefResult.value.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
  expect(xrefResult.value.entries.get(ObjectNumber.of(2))).toEqual({
    type: 1,
    offset: ByteOffset.of(74),
    generationNumber: GenerationNumber.of(0),
  });

  const trailerResult = buildXRefStreamTrailerDict(stream.dictionary.entries);
  assert(trailerResult.ok);
  expect(trailerResult.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(trailerResult.value.size).toBe(3);
});

test("scanStartXRef -> mergeXRefChainで/Prevチェーンをまたいでend-to-endにマージする（テキストxref表とxrefストリームの混在）", async () => {
  const header = "%PDF-1.7\n";
  const oldSection =
    "xref\n" +
    "0 2\n" +
    "0000000000 65535 f\r\n" +
    "0000000100 00000 n\r\n" +
    "trailer\n" +
    "<< /Root 1 0 R /Size 2 >>\n";
  const oldOffset = header.length;

  // 解凍後の生エントリ: obj0=free(nextFree=0,gen=0) obj1=used(offset=999,gen=0、旧revisionのoffset=100を上書き) obj2=used(offset=1000,gen=0、新revisionで追加)
  // zlib.deflateSync(Buffer.from([0,0,0,0, 1,3,0xe7,0, 1,3,0xe8,0])) の結果
  const newCompressed = new Uint8Array([
    120, 156, 99, 96, 96, 96, 96, 100, 126, 206, 192, 200, 252, 130, 1, 0, 7,
    112, 1, 216,
  ]);

  const newOffset = header.length + oldSection.length;
  const newObjHeader =
    "7 0 obj\n" +
    "<< /Type /XRef /Filter /FlateDecode /W [1 2 1] /Size 3 " +
    `/Root 1 0 R /Prev ${oldOffset} /Length ${newCompressed.length} >>\n` +
    "stream\n";
  const footer = `startxref\n${newOffset}\n%%EOF\n`;

  const data = concatBytes([
    encode(header),
    encode(oldSection),
    encode(newObjHeader),
    newCompressed,
    encode("\nendstream\nendobj\n"),
    encode(footer),
  ]);

  const scanResult = scanStartXRef(data);
  assert(scanResult.ok);
  expect(scanResult.value).toBe(newOffset);
  const NEW_OFFSET = scanResult.value;

  const objectResult = await ObjectParser.parseIndirectObject(data, NEW_OFFSET);
  assert(objectResult.ok);
  assert(objectResult.value.body.type === "stream");
  const stream = objectResult.value.body;

  const decompressResult = await decompressFlate(stream.data);
  assert(decompressResult.ok);

  const w = pdfIntArray(stream.dictionary.entries.get("W"));
  const size = pdfInt(stream.dictionary.entries.get("Size"));

  const newXrefResult = decodeXRefStreamEntries({
    data: decompressResult.value,
    w: [w[0], w[1], w[2]],
    size,
  });
  assert(newXrefResult.ok);

  const newTrailerResult = buildXRefStreamTrailerDict(
    stream.dictionary.entries,
  );
  assert(newTrailerResult.ok);

  const parseOldSectionAt = (
    offset: ByteOffset,
  ): Result<{ xref: XRefTable; trailer: TrailerDict }, PdfParseError> =>
    flatMap(parseXRefTable(data, offset), (table) =>
      flatMap(parseTrailer(data, table.trailerOffset), (trailer) =>
        ok({ xref: table.xref, trailer }),
      ),
    );

  const mergeResult = mergeXRefChain(NEW_OFFSET, (offset) =>
    offset === NEW_OFFSET
      ? ok({ xref: newXrefResult.value, trailer: newTrailerResult.value })
      : parseOldSectionAt(offset),
  );
  assert(mergeResult.ok);

  expect(mergeResult.value.mergedXRef.entries.size).toBe(3);

  const entry1 = mergeResult.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry1 !== undefined && entry1.type === 1);
  expect(entry1.offset).toBe(999);

  const entry2 = mergeResult.value.mergedXRef.entries.get(ObjectNumber.of(2));
  assert(entry2 !== undefined && entry2.type === 1);
  expect(entry2.offset).toBe(1000);

  expect(mergeResult.value.latestTrailer.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(mergeResult.value.latestTrailer.size).toBe(3);
});

test("scanStartXRef -> parseXRefTable失敗 -> scanFallbackでend-to-endにtrailerを再構成する（xref破損時のfallback経路）", () => {
  const header = "%PDF-1.7\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n";
  // xrefサブセクションの状態フラグが不正 ('x') であり parseXRefTable は必ず失敗する
  const corruptedXref =
    "xref\n0 1\n0000000100 00000 x\r\ntrailer\n<< /Root 1 0 R /Size 3 >>\n";

  const obj1Offset = header.length;
  const obj2Offset = obj1Offset + obj1.length;
  const corruptedOffset = obj2Offset + obj2.length;
  const footer = `startxref\n${corruptedOffset}\n%%EOF\n`;

  const pdf = header + obj1 + obj2 + corruptedXref + footer;
  const data = encode(pdf);

  const scanResult = scanStartXRef(data);
  assert(scanResult.ok);
  expect(scanResult.value).toBe(corruptedOffset);

  const tableResult = parseXRefTable(data, scanResult.value);
  assert(!tableResult.ok);
  expect(tableResult.error.code).toBe("XREF_TABLE_INVALID");

  const fallbackResult = scanFallback(data);
  assert(fallbackResult.ok);

  expect(fallbackResult.value.trailer.some).toBe(true);
  assert(fallbackResult.value.trailer.some);
  expect(fallbackResult.value.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(fallbackResult.value.trailer.value.size).toBe(3);

  expect(
    fallbackResult.value.xrefTable.entries.get(ObjectNumber.of(1)),
  ).toEqual({
    type: 1,
    offset: ByteOffset.of(obj1Offset),
    generationNumber: GenerationNumber.of(0),
  });
  expect(
    fallbackResult.value.xrefTable.entries.get(ObjectNumber.of(2)),
  ).toEqual({
    type: 1,
    offset: ByteOffset.of(obj2Offset),
    generationNumber: GenerationNumber.of(0),
  });

  expect(fallbackResult.value.warnings).toHaveLength(1);
  expect(fallbackResult.value.warnings[0].code).toBe("XREF_REBUILD");
});
