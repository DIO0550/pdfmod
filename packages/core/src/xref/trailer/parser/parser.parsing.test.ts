import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import { parseTrailer } from "./index";

const encoder = new TextEncoder();

function encode(s: string): Uint8Array {
  return encoder.encode(s);
}

function trailerAt(
  content: string,
  offset = 0,
): { data: Uint8Array; offset: ByteOffset } {
  return { data: encode(content), offset: ByteOffset.of(offset) };
}

test("parseTrailerが関数としてexportされている", () => {
  expect(typeof parseTrailer).toBe("function");
});

test("必須キーのみの最小トレーラ辞書をパースする", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value).toEqual({
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 10,
  });
});

test("/Prevを含む辞書からprevが数値として抽出される", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Prev 1234 >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.prev).toBe(1234);
});

test("/Prevがない辞書でprevがundefinedである", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.prev).toBeUndefined();
});

test("/Infoを含む辞書からinfoが間接参照として抽出される", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Info 5 0 R >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.info).toEqual({
    objectNumber: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/IDのhex stringペアが[Uint8Array, Uint8Array]に変換される", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [<abc123> <def456>] >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  assert(result.value.id);
  expect(result.value.id[0]).toEqual(new Uint8Array([0xab, 0xc1, 0x23]));
  expect(result.value.id[1]).toEqual(new Uint8Array([0xde, 0xf4, 0x56]));
});

test("/IDのLiteralStringが正しくUint8Arrayに変換される", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [(abc) (def)] >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  assert(result.value.id);
  expect(result.value.id[0]).toEqual(new Uint8Array([0x61, 0x62, 0x63]));
  expect(result.value.id[1]).toEqual(new Uint8Array([0x64, 0x65, 0x66]));
});

test.each([
  { label: "LF", ws: "\n" },
  { label: "CR", ws: "\r" },
  { label: "CRLF", ws: "\r\n" },
  { label: "複数スペース", ws: "   " },
])("trailerと<<の間に$labelがある場合に正しくパースされる", ({ ws }) => {
  const content = `trailer${ws}<< /Root 1 0 R /Size 10 >>`;
  const { data, offset } = trailerAt(content);
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.size).toBe(10);
});

test("未サポートキー(単一トークン値)を含む辞書が正常にパースされる", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Encrypt 3 0 R >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.size).toBe(10);
});

test("未知キーの値がネストされた辞書の場合に正しく読み飛ばされる", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown << /A 1 /B << /C 2 >> >> >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.size).toBe(10);
});

test("未知キーの値がネストされた配列の場合に正しく読み飛ばされる", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown [1 [2 3] 4] >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value.size).toBe(10);
});

test("全キーを含むトレーラ辞書が正しくパースされる", () => {
  const { data, offset } = trailerAt(
    "trailer << /Size 42 /Root 1 0 R /Prev 9876 /Info 5 0 R /ID [<aabb> <ccdd>] >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
  expect(result.value).toEqual({
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 42,
    prev: ByteOffset.of(9876),
    info: {
      objectNumber: ObjectNumber.of(5),
      generationNumber: GenerationNumber.of(0),
    },
    id: [new Uint8Array([0xaa, 0xbb]), new Uint8Array([0xcc, 0xdd])],
  });
});

test("trailerがファイル中間にある場合にオフセット指定でパースできる", () => {
  const prefix = "xref\n0 1\n0000000000 65535 f\r\n";
  const trailerStr = "trailer << /Root 1 0 R /Size 1 >>";
  const content = prefix + trailerStr;
  const data = encode(content);
  const result = parseTrailer(data, ByteOffset.of(prefix.length));
  assert(result.ok);
  expect(result.value.size).toBe(1);
});
