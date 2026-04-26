import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfString } from "../pdf/types/pdf-types/index";
import { decodePdfString } from "./decode-pdf-string";

const pdfString = (bytes: Uint8Array): PdfString => ({
  type: "string",
  value: bytes,
  encoding: "literal",
});

test("空バイト列は空文字列を返し警告を出さない", () => {
  const warnings: PdfWarning[] = [];
  const result = decodePdfString(
    pdfString(new Uint8Array([])),
    "Title",
    warnings,
  );
  expect(result).toBe("");
  expect(warnings).toHaveLength(0);
});
