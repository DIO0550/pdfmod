import { expect, test } from "vitest";
import { scanObjectHeaders } from "../../object-scanner";

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

// オブジェクト番号 0 は ISO 32000-1 §7.3.10 に反するため候補にならない（#334）。
test("ObjectNumber が 0 の候補は skip され、正番号の候補だけが採用される", () => {
  const zeroObj = "0 0 obj\n<<>>\nendobj\n";
  const data = encode(`${zeroObj}1 0 obj\n<<>>\nendobj\n`);
  const report = scanObjectHeaders(data);
  expect(report.skipped).toEqual([
    { offset: 0, reason: "object-number-invalid" },
  ]);
  expect(report.hits).toHaveLength(1);
  expect(report.hits[0].objectNumber).toBe(1);
});
