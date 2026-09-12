import {
  isPdfTokenBoundary,
  matchesBytesAt,
  skipWhitespaceAndComments,
} from "../../../lexer/bytes/index";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { BufferedTokenizer } from "../../../objects/object-parser/buffered-tokenizer/index";
import { DirectObject } from "../../../objects/object-parser/direct-object/index";
import type { PdfParseError } from "../../../pdf/errors/index";
import {
  ByteOffset as BO,
  type ByteOffset,
} from "../../../pdf/types/byte-offset/index";
import type { PdfValue, TrailerDict } from "../../../pdf/types/index";
import type { Result } from "../../../utils/result/index";
import { err } from "../../../utils/result/index";
import { trailerDictBuilder } from "../dict-builder/index";

/**
 * 委譲先が返す内部エラーコードを、テキスト形式 trailer の外部 API コード
 * `XREF_TABLE_INVALID` に書き換える。
 * - `trailerDictBuilder` 由来の `TRAILER_DICT_INVALID`
 * - `DirectObject.parse` 由来の `OBJECT_PARSE_UNEXPECTED_TOKEN` / `OBJECT_PARSE_UNTERMINATED`
 * 必須フィールド由来 (`ROOT_NOT_FOUND` / `SIZE_NOT_FOUND`) と `NESTING_TOO_DEEP` は素通しする。
 *
 * @param e - 委譲先が返した PdfParseError
 * @returns 書き換え後の PdfParseError、または素通しの元エラー
 */
const mapErr = (e: PdfParseError): PdfParseError => {
  switch (e.code) {
    case "TRAILER_DICT_INVALID":
    case "OBJECT_PARSE_UNEXPECTED_TOKEN":
    case "OBJECT_PARSE_UNTERMINATED":
      return { ...e, code: "XREF_TABLE_INVALID" };
    default:
      return e;
  }
};

// --- バイト定数 (SCREAMING_SNAKE_CASE) ---

const TRAILER_BYTES = Array.from(new TextEncoder().encode("trailer"));
const TRAILER_KEYWORD_LENGTH = TRAILER_BYTES.length;
/** トップレベル辞書のネスト深度（`DirectObject.parse` の depth 引数の初期値）。 */
const TOP_LEVEL_DEPTH = 0;

// --- エラーヘルパー ---

/**
 * trailer パース失敗時のエラー Result を生成するヘルパー。
 *
 * @param message - エラーメッセージ
 * @param offset - 問題が検出されたバイトオフセット
 * @returns `Err<PdfParseError>` (コード: XREF_TABLE_INVALID)
 */
function failTrailer(
  message: string,
  offset?: ByteOffset,
): Result<TrailerDict, PdfParseError> {
  return err({ code: "XREF_TABLE_INVALID", message, offset });
}

// --- TrailerDict 構築 ---

/**
 * パース済み辞書エントリから TrailerDict を構築する。
 * エラー報告用オフセットは全キー共通で辞書先頭 `dictStart` を渡す
 * （`DirectObject.parse` はエントリ単位の位置情報を返さないため）。
 *
 * @param entries - `DirectObject.parse` が返した辞書の entries
 * @param dictStart - 辞書先頭（`<<`）のバイトオフセット
 * @returns 成功時は `Ok<TrailerDict>`、失敗時は `Err<PdfParseError>`
 */
function buildTrailerDict(
  entries: ReadonlyMap<string, PdfValue>,
  dictStart: ByteOffset,
): Result<TrailerDict, PdfParseError> {
  const result = trailerDictBuilder()
    .root(entries.get("Root"), dictStart)
    .size(entries.get("Size"), dictStart)
    .prev(entries.get("Prev"), dictStart)
    .xrefStm(entries.get("XRefStm"), dictStart)
    .info(entries.get("Info"), dictStart)
    .id(entries.get("ID"), dictStart)
    .encrypt(entries.get("Encrypt"), dictStart)
    .build();
  if (!result.ok) {
    return err(mapErr(result.error));
  }
  return result;
}

/**
 * trailer キーワード位置から辞書を解析し TrailerDict を構築する。
 *
 * 辞書本体の構文解析は `DirectObject.parse` に委譲する。`0 G R` は
 * `foldFreeListRef: false` で null に畳まず raw な参照として受け取り、
 * `/Prev` `/XRefStm`（バイトオフセットであるべきキー）に来た場合は
 * `trailerDictBuilder` の型検証でエラーにする（#334: 畳むと xref チェーンが黙って切れる）。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param offset - trailer キーワードの開始バイトオフセット
 * @returns TrailerDict または PdfParseError
 */
export function parseTrailer(
  data: Uint8Array,
  offset: ByteOffset,
): Result<TrailerDict, PdfParseError> {
  // 入力境界検証
  if (offset < 0 || offset >= data.length) {
    return failTrailer("trailer offset out of bounds", offset);
  }

  // trailer キーワード検証
  if (!matchesBytesAt(data, offset, TRAILER_BYTES)) {
    return failTrailer(`trailer keyword not found at offset ${offset}`, offset);
  }

  // 前方境界チェック
  if (offset > 0 && !isPdfTokenBoundary(data[offset - 1])) {
    return failTrailer(`trailer keyword not found at offset ${offset}`, offset);
  }

  // 後方境界チェック
  const afterTrailer = offset + TRAILER_KEYWORD_LENGTH;
  if (afterTrailer < data.length && !isPdfTokenBoundary(data[afterTrailer])) {
    return failTrailer(`trailer keyword not found at offset ${offset}`, offset);
  }

  // 空白スキップ + Tokenizer 初期化
  const dictStart = BO.of(skipWhitespaceAndComments(data, afterTrailer));
  const bt = new BufferedTokenizer(new Tokenizer(data.subarray(dictStart)));

  // 辞書パース（DirectObject に委譲）
  const valueResult = DirectObject.parse(bt, dictStart, TOP_LEVEL_DEPTH, {
    foldFreeListRef: false,
  });
  if (!valueResult.ok) {
    return err(mapErr(valueResult.error));
  }
  if (valueResult.value.type !== "dictionary") {
    return failTrailer(
      "expected dictionary start (<<) after trailer keyword",
      dictStart,
    );
  }

  // TrailerDict 構築
  return buildTrailerDict(valueResult.value.entries, dictStart);
}
