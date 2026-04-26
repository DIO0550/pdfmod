import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfValue } from "../pdf/types/pdf-types/index";
import type { DocumentMetadata, TrappedState } from "./document-metadata";
import { parseTrappedName } from "./document-metadata";

const makeName = (value: string): PdfValue => ({ type: "name", value });

test("DocumentMetadata は全フィールド optional で空オブジェクトが代入可能", () => {
  const m: DocumentMetadata = {};
  expect(m).toEqual({});
});

test("TrappedState は 'True' | 'False' | 'Unknown' のリテラルユニオン", () => {
  const a: TrappedState = "True";
  const b: TrappedState = "False";
  const c: TrappedState = "Unknown";
  expect([a, b, c]).toEqual(["True", "False", "Unknown"]);
});

test("DocumentMetadata は title〜trapped の 9 フィールド構造を持つ", () => {
  const m: DocumentMetadata = {
    title: "T",
    author: "A",
    subject: "S",
    keywords: "K",
    creator: "C",
    producer: "P",
    creationDate: new Date(2023, 0, 1),
    modDate: new Date(2024, 0, 1),
    trapped: "True",
  };
  expect(m.title).toBe("T");
  expect(m.author).toBe("A");
  expect(m.subject).toBe("S");
  expect(m.keywords).toBe("K");
  expect(m.creator).toBe("C");
  expect(m.producer).toBe("P");
  expect(m.creationDate?.getFullYear()).toBe(2023);
  expect(m.modDate?.getFullYear()).toBe(2024);
  expect(m.trapped).toBe("True");
});

const VALID_TRAPPED: ReadonlyArray<readonly [TrappedState]> = [
  ["True"],
  ["False"],
  ["Unknown"],
];

test.each(
  VALID_TRAPPED,
)("/Trapped Name '%s' は該当 TrappedState に解釈される", (literal) => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName(literal), warnings);
  expect(result).toBe(literal);
  expect(warnings).toHaveLength(0);
});

const INVALID_NAME_VALUES: ReadonlyArray<readonly [string]> = [
  ["Yes"],
  ["true"],
  ["FALSE"],
  [""],
];

test.each(
  INVALID_NAME_VALUES,
)("/Trapped Name '%s' は undefined + TRAPPED_INVALID", (raw) => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(makeName(raw), warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
});

test("/Trapped が PdfString のとき undefined + TRAPPED_INVALID", () => {
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
});

test("/Trapped が PdfBoolean のとき undefined + TRAPPED_INVALID", () => {
  const warnings: PdfWarning[] = [];
  const boolValue: PdfValue = { type: "boolean", value: true };
  const result = parseTrappedName(boolValue, warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
  expect(warnings[0].message).toContain("boolean");
});

test("/Trapped 値が未指定 (undefined) の場合 undefined を返し警告は出さない", () => {
  const warnings: PdfWarning[] = [];
  const result = parseTrappedName(undefined, warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(0);
});

test("未知 Name 値の警告メッセージに値が含まれる（診断性）", () => {
  const warnings: PdfWarning[] = [];
  parseTrappedName(makeName("Yes"), warnings);
  expect(warnings[0].message).toContain("Yes");
});
