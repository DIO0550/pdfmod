import type { PdfError } from "../pdf/errors/error/index";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type {
  PdfDictionary,
  PdfValue,
  TrailerDict,
} from "../pdf/types/pdf-types/index";
import type { Result } from "../utils/result/index";
import { ok } from "../utils/result/index";
import type { ResolveRef } from "./catalog-parser";
import { decodePdfString } from "./decode-pdf-string";
import type { DocumentMetadata } from "./document-metadata";
import { parseTrappedName } from "./document-metadata";
import { parsePdfDate } from "./pdf-date";

/**
 * `DocumentInfoParser.parse` の戻り値。
 */
export interface ParseDocumentInfoResult {
  /** 抽出された /Info 由来メタデータ。/Info 不在 / 抽出失敗時は空オブジェクト */
  readonly metadata: DocumentMetadata;
  /** 抽出処理中に蓄積された警告 */
  readonly warnings: PdfWarning[];
}

/**
 * `/Info` 不在・解決失敗時に返す共有空 metadata。
 *
 * `Object.freeze` で凍結することで、複数の `parse()` 呼び出し間で同じ参照を
 * 返しても呼び出し側のミューテーションが他の結果に波及しないことを保証する。
 */
const EMPTY_METADATA: DocumentMetadata = Object.freeze({});

/**
 * テキストフィールド共通リーダ。値の型チェックと {@link decodePdfString} 呼び出しを束ねる。
 *
 * 分岐:
 *  - 値が `undefined` → `undefined`（警告なし、未指定扱い）
 *  - 値が PdfString 以外 → `undefined` + `STRING_DECODE_FAILED` 警告
 *  - 値が PdfString → `decodePdfString` に委譲
 *
 * @param entries - /Info 辞書のエントリ
 * @param key - 取得するキー（例: `"Title"`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns 復号成功時は文字列、それ以外は `undefined`
 */
const readStringField = (
  entries: Map<string, PdfValue>,
  key: string,
  warnings: PdfWarning[],
): string | undefined => {
  const value = entries.get(key);
  if (value === undefined) {
    return undefined;
  }
  if (value.type !== "string") {
    warnings.push({
      code: "STRING_DECODE_FAILED",
      message: `/${key} expected PdfString but got ${value.type}`,
    });
    return undefined;
  }
  return decodePdfString(value, key, warnings);
};

/**
 * 日時フィールド共通リーダ。値の型チェック → 文字列復号 → {@link parsePdfDate} を束ねる。
 *
 * `parsePdfDate` は警告 push を行わない pure 関数なので、`undefined` を検出した時点で
 * 本リーダ（caller）が `DATE_PARSE_FAILED` 警告を push する（review-002 反映）。
 *
 * 分岐:
 *  - 値が `undefined` → `undefined`（警告なし、未指定扱い）
 *  - 値が PdfString 以外 → `undefined` + `DATE_PARSE_FAILED` 警告
 *  - 文字列復号失敗 → `undefined`（警告は decodePdfString 側で push 済み）
 *  - 日時パース失敗 → `undefined` + `DATE_PARSE_FAILED` 警告
 *
 * @param entries - /Info 辞書のエントリ
 * @param key - 取得するキー（例: `"CreationDate"`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns パース成功時は `Date`、それ以外は `undefined`
 */
const readDateField = (
  entries: Map<string, PdfValue>,
  key: string,
  warnings: PdfWarning[],
): Date | undefined => {
  const value = entries.get(key);
  if (value === undefined) {
    return undefined;
  }
  if (value.type !== "string") {
    warnings.push({
      code: "DATE_PARSE_FAILED",
      message: `/${key} expected PdfString but got ${value.type}`,
    });
    return undefined;
  }
  const raw = decodePdfString(value, key, warnings);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = parsePdfDate(raw);
  if (parsed === undefined) {
    warnings.push({
      code: "DATE_PARSE_FAILED",
      message: `/${key} failed to parse PDF date ${JSON.stringify(raw)}; expected pattern D:YYYYMMDDHHmmSSOHH'mm'`,
    });
    return undefined;
  }
  return parsed;
};

/**
 * `/Info` 辞書から 9 フィールドを抽出して {@link DocumentMetadata} に詰め直す。
 *
 * テキスト 6 フィールド・日時 2 フィールド・Trapped を、それぞれ
 * `readStringField` / `readDateField` / `parseTrappedName` に委譲する。
 * 値が `undefined` のフィールドはオブジェクトに含めない（PR #98 review 反映）。
 *
 * @param dict - 解決済みの `/Info` 辞書
 * @param warnings - 警告蓄積先（mutable）
 * @returns 抽出されたメタデータ
 */
const extractMetadata = (
  dict: PdfDictionary,
  warnings: PdfWarning[],
): DocumentMetadata => {
  const e = dict.entries;
  const metadata: {
    -readonly [K in keyof DocumentMetadata]: DocumentMetadata[K];
  } = {};

  const title = readStringField(e, "Title", warnings);
  if (title !== undefined) {
    metadata.title = title;
  }
  const author = readStringField(e, "Author", warnings);
  if (author !== undefined) {
    metadata.author = author;
  }
  const subject = readStringField(e, "Subject", warnings);
  if (subject !== undefined) {
    metadata.subject = subject;
  }
  const keywords = readStringField(e, "Keywords", warnings);
  if (keywords !== undefined) {
    metadata.keywords = keywords;
  }
  const creator = readStringField(e, "Creator", warnings);
  if (creator !== undefined) {
    metadata.creator = creator;
  }
  const producer = readStringField(e, "Producer", warnings);
  if (producer !== undefined) {
    metadata.producer = producer;
  }
  const creationDate = readDateField(e, "CreationDate", warnings);
  if (creationDate !== undefined) {
    metadata.creationDate = creationDate;
  }
  const modDate = readDateField(e, "ModDate", warnings);
  if (modDate !== undefined) {
    metadata.modDate = modDate;
  }
  const trapped = parseTrappedName(e.get("Trapped"), warnings);
  if (trapped !== undefined) {
    metadata.trapped = trapped;
  }
  return metadata;
};

/**
 * トレーラ辞書の `/Info` 間接参照を解決し、{@link DocumentMetadata} を抽出する
 * companion object。ISO 32000-2:2020 § 14.3.3 (Document Information Dictionary) 準拠。
 *
 * 分岐:
 *  - `/Info` 不在 → 空 metadata + 空 warnings の Ok
 *  - resolver 失敗 → `INFO_RESOLVE_FAILED` 警告 + 空 metadata
 *  - 解決値が dictionary 以外 → `INFO_NOT_DICTIONARY` 警告 + 空 metadata
 *  - 辞書あり → 9 フィールドを抽出して返す
 *
 * 現状 `Result.err` 経路は使用していない（resolver は契約上 Promise を reject せず
 * `err` を `Result.ok` に正規化して戻す）。
 */
export const DocumentInfoParser = {
  /**
   * `/Info` 辞書から PDF ドキュメントメタデータを抽出する。
   *
   * @param trailerDict - trailer parser 出力（`info` は IndirectRef または undefined）
   * @param resolveRef - 間接参照を解決する関数
   * @returns 抽出結果と警告を含む `Ok`
   */
  async parse(
    trailerDict: TrailerDict,
    resolveRef: ResolveRef,
  ): Promise<Result<ParseDocumentInfoResult, PdfError>> {
    const warnings: PdfWarning[] = [];
    if (trailerDict.info === undefined) {
      return ok({ metadata: EMPTY_METADATA, warnings });
    }
    const resolved = await resolveRef(trailerDict.info);
    if (!resolved.ok) {
      warnings.push({
        code: "INFO_RESOLVE_FAILED",
        message: `Failed to resolve /Info ${trailerDict.info.objectNumber} ${trailerDict.info.generationNumber}: cause=${resolved.error.code}, message=${resolved.error.message}`,
      });
      return ok({ metadata: EMPTY_METADATA, warnings });
    }
    if (resolved.value.type !== "dictionary") {
      warnings.push({
        code: "INFO_NOT_DICTIONARY",
        message: `Trailer /Info did not resolve to a dictionary (got: ${resolved.value.type})`,
      });
      return ok({ metadata: EMPTY_METADATA, warnings });
    }
    const metadata = extractMetadata(resolved.value, warnings);
    return ok({ metadata, warnings });
  },
} as const;
