import { expect, test } from "vitest";
import type { PdfWarning, PdfWarningCode } from "../../../index";

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

test("PdfWarningCode に INFO_RESOLVE_FAILED が含まれる", () => {
  const code: PdfWarningCode = "INFO_RESOLVE_FAILED";
  expect(code).toBe("INFO_RESOLVE_FAILED");
});

test("PdfWarningCode に INFO_NOT_DICTIONARY が含まれる", () => {
  const code: PdfWarningCode = "INFO_NOT_DICTIONARY";
  expect(code).toBe("INFO_NOT_DICTIONARY");
});

test("PdfWarningCode に STRING_DECODE_FAILED が含まれる", () => {
  const code: PdfWarningCode = "STRING_DECODE_FAILED";
  expect(code).toBe("STRING_DECODE_FAILED");
});

test("PdfWarningCode に TRAPPED_INVALID が含まれる", () => {
  const code: PdfWarningCode = "TRAPPED_INVALID";
  expect(code).toBe("TRAPPED_INVALID");
});
