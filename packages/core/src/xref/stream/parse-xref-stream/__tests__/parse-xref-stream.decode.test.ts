import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
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

test("Predictorなしのxrefストリームをデコードしてxref/trailerを返す", async () => {
  // zlib.deflateSync(Buffer.from([0,0,0,0, 1,0,100,0])) の結果
  const compressed = new Uint8Array([
    120, 156, 99, 96, 96, 96, 96, 100, 72, 97, 0, 0, 0, 212, 0, 102,
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

  assert(result.ok);
  expect(result.value.xref.size).toBe(2);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
  assert(result.value.trailer !== undefined);
  expect(result.value.trailer.root).toEqual({
    objectNumber: ObjectNumber.of(2),
    generationNumber: GenerationNumber.of(0),
  });
});

test("PNG Up予測子付きのxrefストリームを展開・予測子逆変換してデコードする", async () => {
  // 予測子適用前の生エントリ: obj0=free(0,0) obj1=used(offset=100,gen=0)
  // PNG Up前方変換 -> zlib.deflateSync(Buffer.from([2,0,0,0,0, 2,1,0,100,0]))
  const compressed = new Uint8Array([
    120, 156, 99, 98, 96, 96, 96, 96, 98, 100, 72, 97, 0, 0, 0, 244, 0, 106,
  ]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 4 >> " +
    `/W [1 2 1] /Size 2 /Root 2 0 R /Length ${compressed.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    compressed,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Filterが単一要素配列[/FlateDecode]の場合もbareネームと同様に展開してデコードする（ISO 32000-1 §7.4）", async () => {
  // zlib.deflateSync(Buffer.from([0,0,0,0, 1,0,100,0])) の結果
  const compressed = new Uint8Array([
    120, 156, 99, 96, 96, 96, 96, 100, 72, 97, 0, 0, 0, 212, 0, 102,
  ]);
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /Filter [/FlateDecode] /W [1 2 1] /Size 2 " +
    `/Root 2 0 R /Length ${compressed.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    compressed,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Filter省略時は展開せず生データをそのままデコードする", async () => {
  const rawEntries = new Uint8Array([1, 5, 0]);
  const objHeader =
    "1 0 obj\n" +
    `<< /Type /XRef /W [1 1 1] /Size 1 /Root 2 0 R /Length ${rawEntries.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    rawEntries,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(5),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Rootが無いxrefストリームはtrailer:undefinedで成功する（/XRefStm補助ストリーム用, ISO 32000-1 §7.5.8.4）", async () => {
  const rawEntries = new Uint8Array([1, 5, 0]);
  const objHeader =
    "1 0 obj\n" +
    `<< /Type /XRef /W [1 1 1] /Size 1 /Length ${rawEntries.length} >>\n` +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(objHeader),
    rawEntries,
    encode("\nendstream\nendobj\n"),
  ]);

  const result = await parseXRefStream(data, ByteOffset.of(HEADER_LEN));

  assert(result.ok);
  expect(result.value.trailer).toBeUndefined();
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(5),
    generationNumber: GenerationNumber.of(0),
  });
});

test("間接参照 /Length を持つ xref ストリームをデコードする", async () => {
  const rawEntries = new Uint8Array([1, 5, 0]);
  const lengthObj = `10 0 obj\n${rawEntries.length}\nendobj\n`;
  const objHeader =
    "1 0 obj\n" +
    "<< /Type /XRef /W [1 1 1] /Size 1 /Root 2 0 R /Length 10 0 R >>\n" +
    "stream\n";
  const data = concatBytes([
    encode(HEADER),
    encode(lengthObj),
    encode(objHeader),
    rawEntries,
    encode("\nendstream\nendobj\n"),
  ]);

  const lengthObjLen = encode(lengthObj).length;
  const result = await parseXRefStream(
    data,
    ByteOffset.of(HEADER_LEN + lengthObjLen),
  );

  assert(result.ok);
  expect(result.value.xref.size).toBe(1);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(5),
    generationNumber: GenerationNumber.of(0),
  });
  assert(result.value.trailer !== undefined);
  expect(result.value.trailer.root).toEqual({
    objectNumber: ObjectNumber.of(2),
    generationNumber: GenerationNumber.of(0),
  });
});
