import type { PdfParseError } from "../../../pdf/errors/index";
import type { PdfValue, TrailerDict } from "../../../pdf/types/index";
import type { Result } from "../../../utils/result/index";
import { mapErr } from "../../../utils/result/index";
import { trailerDictBuilder } from "../../trailer/dict-builder/index";

/**
 * xrefストリーム辞書から TrailerDict を構築する。
 *
 * 入力は既にパース済みの辞書データ。辞書Map から TrailerDict に必要な
 * フィールド (`/Root`, `/Size`, `/Prev`, `/Info`, `/ID`) を取得し、
 * 共通ビルダーでバリデーション・構築を行う。
 *
 * ビルダーがオプションフィールドの不正に対して返す `TRAILER_DICT_INVALID`
 * は、外部契約である `XREF_STREAM_INVALID` に再ラップする。
 * `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND` は素通しで外部契約を維持する。
 *
 * @param dict - パース済みのxrefストリーム辞書
 * @returns 成功時は `Ok<TrailerDict>`、失敗時は `Err<PdfParseError>`
 */
export function buildXRefStreamTrailerDict(
  dict: ReadonlyMap<string, PdfValue>,
): Result<TrailerDict, PdfParseError> {
  const built = trailerDictBuilder()
    .root(dict.get("Root"))
    .size(dict.get("Size"))
    .prev(dict.get("Prev"))
    .info(dict.get("Info"))
    .id(dict.get("ID"))
    .build();
  return mapErr(
    (e: PdfParseError): PdfParseError =>
      e.code === "TRAILER_DICT_INVALID"
        ? { ...e, code: "XREF_STREAM_INVALID" }
        : e,
  )(built);
}
