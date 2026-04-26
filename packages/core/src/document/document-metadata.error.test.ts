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

test("/Trapped が PdfString のとき undefined + TRAPPED_INVALID（メッセージに type と値要約を含む）", () => {
  const warnings: PdfWarning[] = [];
  const stringValue: PdfValue = {
    type: "string",
    value: new Uint8Array([0x54, 0x72, 0x75, 0x65]),
    encoding: "literal",
  };
  const result = parseTrappedName(stringValue, warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
  expect(warnings[0].message).toContain("string");
  expect(warnings[0].message).toContain("len=4");
  expect(warnings[0].message).toContain("enc=literal");
});

test("/Trapped が PdfBoolean のとき undefined + TRAPPED_INVALID（メッセージに type と値を含む）", () => {
  const warnings: PdfWarning[] = [];
  const boolValue: PdfValue = { type: "boolean", value: true };
  const result = parseTrappedName(boolValue, warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
  expect(warnings[0].message).toContain("boolean");
  expect(warnings[0].message).toContain("true");
});

test("/Trapped が PdfInteger のとき undefined + TRAPPED_INVALID（メッセージに type と値を含む）", () => {
  const warnings: PdfWarning[] = [];
  const intValue: PdfValue = { type: "integer", value: 1 };
  const result = parseTrappedName(intValue, warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
  expect(warnings[0].message).toContain("integer");
  expect(warnings[0].message).toContain("1");
});
