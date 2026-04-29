import { expect, test } from "vitest";
import { GenerationNumber, ObjectNumber } from "../../pdf/types/index";
import { scanObjectHeaders } from "./object-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

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
