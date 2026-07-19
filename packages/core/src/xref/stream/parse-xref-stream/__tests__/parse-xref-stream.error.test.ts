import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { parseXRefStream } from "../index";

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

const HEADER = "%PDF-1.7\n";
const HEADER_LEN = encode(HEADER).length;

test("stream以外のオブジェクト（辞書のみ）を指す場合XREF_STREAM_INVALIDを返す", async () => {
  const data = concatBytes([
    encode(HEADER),
    encode(
      "1 0 obj\n<< /Type /XRef /W [1 2 1] /Size 2 /Root 2 0 R >>\nendobj\n",
    ),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/Typeが/XRefでない場合、辞書バリデーションのXREF_STREAM_INVALIDが伝播する", async () => {
  const compressed = new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /ObjStm /Filter /FlateDecode /W [1 2 1] /Size 2 " +
    `/Root 2 0 R /Length ${compressed.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    compressed,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/ObjStm");
});

test("FlateDecode展開に失敗した場合、FLATEDECODE_FAILEDが伝播する", async () => {
  const corrupt = new Uint8Array([1, 2, 3, 4, 5]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /Filter /FlateDecode /W [1 2 1] /Size 2 " +
    `/Root 2 0 R /Length ${corrupt.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    corrupt,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("展開後データ長が/Wと/Sizeに一致しない場合、decodeXRefStreamEntries由来のXREF_STREAM_INVALIDが伝播する", async () => {
  // zlib.deflateSync(Buffer.from([0,0,0,0])) - 1エントリ分(4byte)しかないのにSize=2を要求
  const compressed = new Uint8Array([
    120, 156, 99, 96, 96, 96, 0, 0, 0, 4, 0, 1,
  ]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /Filter /FlateDecode /W [1 2 1] /Size 2 " +
    `/Root 2 0 R /Length ${compressed.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    compressed,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/Rootが有っても/Prevが不正な値の場合はXREF_STREAM_INVALIDが伝播する（ROOT_NOT_FOUND以外は寛容にしない）", async () => {
  const rawEntries = new Uint8Array([1, 5, 0]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /W [1 1 1] /Size 1 /Root 2 0 R /Prev -1 " +
    `/Length ${rawEntries.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    rawEntries,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/DecodeParmsの/Predictorが未サポート値の場合、Predictor由来のXREF_STREAM_INVALIDが伝播する", async () => {
  const compressed = new Uint8Array([
    120, 156, 99, 96, 96, 96, 96, 100, 72, 97, 0, 0, 0, 212, 0, 102,
  ]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /Filter /FlateDecode /DecodeParms << /Predictor 5 >> " +
    `/W [1 2 1] /Size 2 /Root 2 0 R /Length ${compressed.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    compressed,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});
