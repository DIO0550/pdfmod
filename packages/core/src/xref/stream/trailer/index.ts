import type { PdfParseError } from "../../../pdf/errors/index";
import type { PdfValue, TrailerDict } from "../../../pdf/types/index";
import type { Result } from "../../../utils/result/index";
import { err } from "../../../utils/result/index";
import { trailerDictBuilder } from "../../trailer/dict-builder/index";

/**
 * `trailerDictBuilder` 由来の `TRAILER_DICT_INVALID` を、xref ストリーム
 * 経由の外部 API コード `XREF_STREAM_INVALID` に書き換える。
 * 必須フィールド由来 (`ROOT_NOT_FOUND` / `SIZE_NOT_FOUND`) は素通しする。
 *
 * @param e - ビルダーが返した PdfParseError
 * @returns 書き換え後の PdfParseError、または素通しの元エラー
 */
const mapErr = (e: PdfParseError): PdfParseError => {
  if (e.code === "TRAILER_DICT_INVALID") {
    return { ...e, code: "XREF_STREAM_INVALID" };
  }
  return e;
};

/**
 * xrefストリーム辞書から TrailerDict を構築する。
 *
 * 入力は既にパース済みの辞書データ。辞書Map から TrailerDict に必要な
 * フィールド (`/Root`, `/Size`, `/Prev`, `/Info`, `/ID`) を取得し、
 * 共通ビルダーでバリデーション・構築を行う。
 *
 * ビルダーがオプションフィールドの不正に対して返す `TRAILER_DICT_INVALID`
 * は、外部 API 契約の `XREF_STREAM_INVALID` に書き換える。
 * `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND` はそのまま素通しで外部契約を維持する。
 *
 * @param dict - パース済みのxrefストリーム辞書
 * @returns 成功時は `Ok<TrailerDict>`、失敗時は `Err<PdfParseError>`
 */
export function buildXRefStreamTrailerDict(
  dict: ReadonlyMap<string, PdfValue>,
): Result<TrailerDict, PdfParseError> {
  const result = trailerDictBuilder()
    .root(dict.get("Root"))
    .size(dict.get("Size"))
    .prev(dict.get("Prev"))
    .info(dict.get("Info"))
    .id(dict.get("ID"))
    .build();
  if (!result.ok) {
    return err(mapErr(result.error));
  }
  return result;
}
