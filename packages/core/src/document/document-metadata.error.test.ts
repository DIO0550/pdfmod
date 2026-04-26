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
