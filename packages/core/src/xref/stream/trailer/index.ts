import type { PdfParseError } from "../../../errors/index";
import type { Result } from "../../../result/index";
import type { PdfValue, TrailerDict } from "../../../types/index";
import { trailerDictBuilder } from "../../trailer/dict-builder/index";

/**
 * xrefストリーム辞書から TrailerDict を構築する。
 *
 * 入力は既にパース済みの辞書データ。辞書Map から TrailerDict に必要な
 * フィールド (`/Root`, `/Size`, `/Prev`, `/Info`, `/ID`) を取得し、
 * 共通ビルダーでバリデーション・構築を行う。
 *
 * @param dict - パース済みのxrefストリーム辞書
 * @returns 成功時は `Ok<TrailerDict>`、失敗時は `Err<PdfParseError>`
 */
export function buildXRefStreamTrailerDict(
  dict: ReadonlyMap<string, PdfValue>,
): Result<TrailerDict, PdfParseError> {
  return trailerDictBuilder("XREF_STREAM_INVALID")
    .root(dict.get("Root"))
    .size(dict.get("Size"))
    .prev(dict.get("Prev"))
    .info(dict.get("Info"))
    .id(dict.get("ID"))
    .build();
}
