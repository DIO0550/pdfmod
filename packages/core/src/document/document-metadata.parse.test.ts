import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfValue } from "../pdf/types/pdf-types/index";
import { PdfTrapped, parseTrappedName } from "./document-metadata";

const makeName = (value: string): PdfValue => ({ type: "name", value });

test.each([
  ["True"] as const,
  ["False"] as const,
  ["Unknown"] as const,
])("/Trapped Name '%s' は PdfTrapped '%s' に解釈される", (literal) => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName(literal), warnings);
  expect(PdfTrapped.create(literal)).toStrictEqual({
    ok: true,
    value: result,
  });
  expect(warnings).toHaveLength(0);
});

test("/Trapped 値が未指定（undefined）の場合は undefined（警告なし）", () => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(undefined, warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(0);
});
