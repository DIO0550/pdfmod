import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfValue } from "../pdf/types/pdf-types/index";
import { parseTrappedName } from "./document-metadata";

const makeName = (value: string): PdfValue => ({ type: "name", value });

test("/Trapped Name 'Yes' は undefined + TRAPPED_INVALID", () => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName("Yes"), warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
});

test.each([
  ["true"],
  ["false"],
  ["unknown"],
])("/Trapped Name '%s' (小文字) は undefined + TRAPPED_INVALID（大文字小文字を区別する）", (lowercase) => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName(lowercase), warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
});

test("/Trapped Name '' (空文字) は undefined + TRAPPED_INVALID", () => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName(""), warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
});
