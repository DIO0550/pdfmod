import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfValue } from "../pdf/types/pdf-types/index";
import { parseTrappedName } from "./document-metadata";

const makeName = (value: string): PdfValue => ({ type: "name", value });

test.each([
  ["True"] as const,
  ["False"] as const,
  ["Unknown"] as const,
])("/Trapped Name '%s' は TrappedState '%s' に解釈される", (literal) => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName(literal), warnings);
  expect(result).toBe(literal);
  expect(warnings).toHaveLength(0);
});
