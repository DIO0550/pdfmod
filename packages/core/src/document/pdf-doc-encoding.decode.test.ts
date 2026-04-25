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
