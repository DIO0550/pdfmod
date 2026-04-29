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
