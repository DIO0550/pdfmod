import { expect, test } from "vitest";
import { scanObjectHeaders } from "./object-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

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
