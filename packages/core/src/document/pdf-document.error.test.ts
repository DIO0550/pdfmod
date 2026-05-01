import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";

test("空入力は INVALID_HEADER を返す", async () => {
  const result = await PdfDocument.load(new Uint8Array());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("`%PDF-` シグネチャ不在の入力は INVALID_HEADER を返す", async () => {
  const result = await PdfDocument.load(new TextEncoder().encode("not a pdf"));

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("不明な PDF バージョン (`%PDF-9.9`) は INVALID_HEADER を返す", async () => {
  const result = await PdfDocument.load(new TextEncoder().encode("%PDF-9.9\n"));

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("TAB 終端の `%PDF-1.7` は INVALID_HEADER を返さない", async () => {
  const result = await PdfDocument.load(
    new TextEncoder().encode("%PDF-1.7\trest of file"),
  );

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).not.toBe("INVALID_HEADER");
});
