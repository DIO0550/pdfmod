import { expect, test } from "vitest";
import { GenerationNumber, ObjectNumber } from "../../pdf/types/index";
import { scanObjectHeaders } from "./object-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("単一 `1 0 obj` を含むデータから 1 件検出する", () => {
  const data = encode("1 0 obj\n<<>>\nendobj\n");
  const report = scanObjectHeaders(data);
  expect(report).toEqual({
    hits: [
      {
        objectNumber: ObjectNumber.of(1),
        generation: GenerationNumber.of(0),
        offset: 0,
      },
    ],
    skipped: [],
  });
});

test("複数 obj を offset 昇順で検出する", () => {
  const body = "1 0 obj\n<<>>\nendobj\n5 0 obj\n<<>>\nendobj\n";
  const data = encode(body);
  const report = scanObjectHeaders(data);
  const firstOffset = 0;
  const secondOffset = body.indexOf("5 0 obj");
  expect(report.skipped).toEqual([]);
  expect(report.hits).toEqual([
    {
      objectNumber: ObjectNumber.of(1),
      generation: GenerationNumber.of(0),
      offset: firstOffset,
    },
    {
      objectNumber: ObjectNumber.of(5),
      generation: GenerationNumber.of(0),
      offset: secondOffset,
    },
  ]);
});

test("`object` のような部分一致は検出しない", () => {
  const data = encode("object reference 1 0 OBJX\n");
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test.each([
  ["LF", "1 0 obj\n"],
  ["CR", "1 0 obj\r"],
  ["SPACE", "1 0 obj "],
  ["TAB", "1 0 obj\t"],
])("`obj` 直後が %s でも検出する", (_label, source) => {
  const data = encode(source);
  const report = scanObjectHeaders(data);
  expect(report.hits).toHaveLength(1);
  expect(report.hits[0]).toEqual({
    objectNumber: ObjectNumber.of(1),
    generation: GenerationNumber.of(0),
    offset: 0,
  });
});

test.each([
  ["LF", "1\n0\nobj\n"],
  ["CR", "1\r0\robj\r"],
  ["TAB", "1\t0\tobj\t"],
])("数字とキーワードの区切りが %s でも検出する", (_label, source) => {
  const data = encode(source);
  const report = scanObjectHeaders(data);
  expect(report.hits).toHaveLength(1);
  expect(report.hits[0].objectNumber).toBe(ObjectNumber.of(1));
  expect(report.hits[0].generation).toBe(GenerationNumber.of(0));
});

test("`obj` を含まないデータは空配列を返す", () => {
  const data = encode("no headers here, just plain text\n");
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("空の Uint8Array に対して空配列を返す", () => {
  const data = new Uint8Array(0);
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("ObjectNumber が safe integer 違反の候補は skip される", () => {
  const overflow = "9".repeat(21);
  const source = `${overflow} 0 obj\n<<>>\nendobj\n`;
  const data = encode(source);
  const report = scanObjectHeaders(data);
  expect(report.hits).toEqual([]);
  expect(report.skipped).toEqual([
    { offset: 0, reason: "object-number-invalid" },
  ]);
});

test("GenerationNumber が範囲外 (>65535) の候補は skip される", () => {
  const data = encode("1 70000 obj\n<<>>\nendobj\n");
  const report = scanObjectHeaders(data);
  expect(report.hits).toEqual([]);
  expect(report.skipped).toEqual([{ offset: 0, reason: "generation-invalid" }]);
});

test("負記号を含む壊れ入力 `0 -1 obj` は hits に含めない", () => {
  const data = encode("0 -1 obj\n<<>>\nendobj\n");
  const report = scanObjectHeaders(data);
  expect(report.hits).toEqual([]);
});

test.each([
  ["abc1 0 obj\n"],
  ["xref1 0 obj\n"],
])("ヘッダ先頭の直前にトークン境界が無い場合は検出しない: %s", (source) => {
  const data = encode(source);
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("コメント内の `1 0 obj` は検出しない", () => {
  const data = encode("% 1 0 obj inside a comment\n");
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("数字と obj の間にコメントが挟まる場合も検出する", () => {
  const data = encode("1 0%comment\nobj\n");
  const report = scanObjectHeaders(data);
  expect(report.skipped).toEqual([]);
  expect(report.hits).toHaveLength(1);
  expect(report.hits[0].objectNumber).toBe(ObjectNumber.of(1));
  expect(report.hits[0].generation).toBe(GenerationNumber.of(0));
});

test.each([
  ["先頭のコメント全体に obj 風文字列", "% 1 0 obj inside comment\n"],
  ["行末コメント中の obj", "1 0 R % nested 2 0 obj here\n"],
  ["連続コメント行内の obj", "%a\n%b 3 0 obj\n"],
])("コメント内の obj 風文字列は検出しない: %s", (_label, source) => {
  const data = encode(source);
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("コメント外の obj はコメントに紛れず正しく検出される", () => {
  const data = encode("% header comment\n1 0 obj\n<<>>\nendobj\n");
  const headerOffset = "% header comment\n".length;
  const report = scanObjectHeaders(data);
  expect(report.skipped).toEqual([]);
  expect(report.hits).toEqual([
    {
      objectNumber: ObjectNumber.of(1),
      generation: GenerationNumber.of(0),
      offset: headerOffset,
    },
  ]);
});
