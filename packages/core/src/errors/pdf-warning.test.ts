import { expect, test } from "vitest";
import type { PdfWarning } from "../index";

test("PdfWarningは全フィールドを持てる", () => {
  const warning: PdfWarning = {
    code: "XREF_OFFSET_MISMATCH",
    message: "offset mismatch",
    offset: 1024,
    recovery: "scanned nearby bytes",
  };
  expect(warning.code).toBe("XREF_OFFSET_MISMATCH");
  expect(warning.recovery).toBe("scanned nearby bytes");
});

test("PdfWarningのoffsetとrecoveryは省略可能", () => {
  const warning: PdfWarning = {
    code: "EOF_NOT_FOUND",
    message: "no EOF marker",
  };
  expect(warning.offset).toBeUndefined();
  expect(warning.recovery).toBeUndefined();
});
