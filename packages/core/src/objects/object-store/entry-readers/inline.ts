import type { PdfError } from "../../../errors/index";
import type { Result } from "../../../result/index";
import { err } from "../../../result/index";
import type {
  IndirectRef,
  PdfObject,
  XRefUsedEntry,
} from "../../../types/pdf-types/index";
import type { ResolveLength } from "../../object-parser/index";
import { ObjectParser } from "../../object-parser/index";

/**
 * type=1 の XRefUsedEntry を読み取り、inline indirect object をパースする。
 *
 * @param data - PDF バイナリデータ
 * @param entry - type=1 の XRefEntry（offset を含む）
 * @param ref - 解決対象の間接参照（obj ヘッダ検証用）
 * @param resolveLength - /Length 間接参照解決コールバック
 * @returns パースされた PdfObject、またはエラー
 */
export async function readInlineEntry(
  data: Uint8Array,
  entry: XRefUsedEntry,
  ref: IndirectRef,
  resolveLength: ResolveLength,
): Promise<Result<PdfObject, PdfError>> {
  const parseResult = await ObjectParser.parseIndirectObject(
    data,
    entry.offset as number,
    resolveLength,
  );
  if (!parseResult.ok) {
    return parseResult;
  }

  if (
    parseResult.value.objectNumber !== ref.objectNumber ||
    parseResult.value.generationNumber !== ref.generationNumber
  ) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `obj header mismatch: expected ${ref.objectNumber} ${ref.generationNumber}, got ${parseResult.value.objectNumber} ${parseResult.value.generationNumber}`,
      offset: entry.offset,
    });
  }

  return { ok: true, value: parseResult.value.value };
}
