import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import { decodePdfDocEncoding } from "./pdf-doc-encoding";

test("ASCII バイト列をそのままデコードする", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  const result = decodePdfDocEncoding(bytes, "Title", warnings);
  expect(result).toBe("Hello");
  expect(warnings).toHaveLength(0);
});

const PASSTHROUGH_BYTES: ReadonlyArray<readonly [number, string]> = [
  ...Array.from(
    { length: 0x18 },
    (_, i) => [i, String.fromCharCode(i)] as const,
  ),
  ...Array.from(
    { length: 0x7f - 0x20 + 1 },
    (_, i) => [0x20 + i, String.fromCharCode(0x20 + i)] as const,
  ),
];

const SPECIAL_BYTES: ReadonlyArray<readonly [number, string]> = [
  [0x18, "˘"],
  [0x19, "ˇ"],
  [0x1a, "ˆ"],
  [0x1b, "˙"],
  [0x1c, "˝"],
  [0x1d, "˛"],
  [0x1e, "˚"],
  [0x1f, "˜"],
  [0x80, "•"],
  [0x81, "†"],
  [0x82, "‡"],
  [0x83, "…"],
  [0x84, "—"],
  [0x85, "–"],
  [0x86, "ƒ"],
  [0x87, "⁄"],
  [0x88, "‹"],
  [0x89, "›"],
  [0x8a, "−"],
  [0x8b, "‰"],
  [0x8c, "„"],
  [0x8d, "“"],
  [0x8e, "”"],
  [0x8f, "‘"],
  [0x90, "’"],
  [0x91, "‚"],
  [0x92, "™"],
  [0x93, "ﬁ"],
  [0x94, "ﬂ"],
  [0x95, "Ł"],
  [0x96, "Œ"],
  [0x97, "Š"],
  [0x98, "Ÿ"],
  [0x99, "Ž"],
  [0x9a, "ı"],
  [0x9b, "ł"],
  [0x9c, "œ"],
  [0x9d, "š"],
  [0x9e, "ž"],
  [0xa0, "€"],
];

const LATIN1_BYTES: ReadonlyArray<readonly [number, string]> = Array.from(
  { length: 0xff - 0xa1 + 1 },
  (_, i) => [0xa1 + i, String.fromCharCode(0xa1 + i)] as const,
).filter(([byte]) => byte !== 0xad);

const ASSIGNED_BYTES: ReadonlyArray<readonly [number, string]> = [
  ...PASSTHROUGH_BYTES,
  ...SPECIAL_BYTES,
  ...LATIN1_BYTES,
];

test.each(
  ASSIGNED_BYTES,
)("PDFDocEncoding バイト 0x%i は対応する Unicode 文字にデコードされる", (byte, expected) => {
  const warnings: PdfWarning[] = [];
  const result = decodePdfDocEncoding(
    new Uint8Array([byte]),
    "Title",
    warnings,
  );
  expect(result).toBe(expected);
  expect(warnings).toHaveLength(0);
});
