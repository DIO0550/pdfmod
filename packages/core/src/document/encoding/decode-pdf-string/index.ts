import { Uint8ArrayEx } from "../../../ext/uint8-array/index";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import type { PdfString } from "../../../pdf/types/pdf-types/index";
import type { Option } from "../../../utils/option";
import { none, some } from "../../../utils/option";
import { decodePdfDocEncoding } from "../pdf-doc-encoding";

const UTF8_BOM_BYTE_0 = 0xef;
const UTF8_BOM_BYTE_1 = 0xbb;
const UTF8_BOM_BYTE_2 = 0xbf;
const UTF16_BE_BOM_BYTE_0 = 0xfe;
const UTF16_BE_BOM_BYTE_1 = 0xff;

const Boms = {
  Utf8: [UTF8_BOM_BYTE_0, UTF8_BOM_BYTE_1, UTF8_BOM_BYTE_2],
  Utf16Be: [UTF16_BE_BOM_BYTE_0, UTF16_BE_BOM_BYTE_1],
} as const;

type DecodeContext = {
  readonly fieldName: string;
  readonly warnings: PdfWarning[];
};

/**
 * BOM 付き Unicode テキスト文字列を厳密復号する。
 *
 * @param bytes - BOM を含む PDF テキスト文字列
 * @param encoding - BOM で確定した文字エンコーディング
 * @param context - 警告対象のフィールドと警告蓄積先
 * @returns 復号結果。不正な符号化や復号器の失敗時は none
 */
const decodeUnicodeString = (
  bytes: Uint8Array,
  encoding: "utf-8" | "utf-16be",
  { fieldName, warnings }: DecodeContext,
): Option<string> => {
  const utf8 = encoding === "utf-8";
  const bomLength = utf8 ? Boms.Utf8.length : Boms.Utf16Be.length;
  if (bytes.length === bomLength) {
    return some("");
  }
  try {
    const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: utf8 });
    return some(decoder.decode(bytes.subarray(bomLength)));
  } catch {
    warnings.push({
      code: "STRING_DECODE_FAILED",
      message: `${encoding.toUpperCase()} decode failed for /${fieldName}`,
    });
    return none;
  }
};

/**
 * PdfString の bytes を JavaScript 文字列に復号する。
 *
 * 分岐:
 *  - 空バイト列 → `some("")`（警告なし、正常扱い）
 *  - 先頭 EF BB BF → UTF-8、先頭 FE FF → UTF-16BE で厳密復号
 *  - いずれかの BOM 単独 → `some("")`（警告なし）
 *  - BOM なし → {@link decodePdfDocEncoding} に委譲
 *
 * @param pdfString - 入力 PdfString
 * @param fieldName - 警告メッセージに含めるフィールド名（例: `"Title"`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns 復号結果。BOM 付き Unicode 文字列の復号失敗時は none
 */
export const decodePdfString = (
  pdfString: PdfString,
  fieldName: string,
  warnings: PdfWarning[],
): Option<string> => {
  const bytes = pdfString.value;
  if (bytes.length === 0) {
    return some("");
  }
  if (Uint8ArrayEx.matchesAt(bytes, 0, Boms.Utf8)) {
    return decodeUnicodeString(bytes, "utf-8", { fieldName, warnings });
  }
  if (Uint8ArrayEx.matchesAt(bytes, 0, Boms.Utf16Be)) {
    return decodeUnicodeString(bytes, "utf-16be", { fieldName, warnings });
  }
  return some(decodePdfDocEncoding(bytes, fieldName, warnings));
};
