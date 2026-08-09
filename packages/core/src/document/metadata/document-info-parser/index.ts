import type { PdfWarning } from "../../../pdf/errors/warning/index";
import type {
  PdfDictionary,
  PdfValue,
  TrailerDict,
} from "../../../pdf/types/pdf-types/index";
import { stripUndefined } from "../../../utils/object";
import type { Option } from "../../../utils/option";
import { none, unwrapOr } from "../../../utils/option";
import type { ResolveRef } from "../../catalog/catalog-parser";
import { parsePdfDate } from "../../date/pdf-date";
import { decodePdfString } from "../../encoding/decode-pdf-string";
import type { DocumentMetadata } from "../document-metadata";
import { parseTrappedName } from "../document-metadata";

/**
 * `DocumentInfoParser.parse` の戻り値。
 */
export interface ParsedDocumentInfo {
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
 *  - 値が `undefined` → `none`（警告なし、未指定扱い）
 *  - 値が PdfString 以外 → `none` + `STRING_DECODE_FAILED` 警告
 *  - 値が PdfString → `decodePdfString` に委譲 (Option<string>)
 *
 * @param entries - /Info 辞書のエントリ
 * @param key - 取得するキー（例: `"Title"`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns 復号成功時は Option.some(string)、それ以外は Option.none
 */
const readStringField = (
  entries: Map<string, PdfValue>,
  key: string,
  warnings: PdfWarning[],
): Option<string> => {
  const value = entries.get(key);
  if (value === undefined) {
    return none;
  }
  if (value.type !== "string") {
    warnings.push({
      code: "STRING_DECODE_FAILED",
      message: `/${key} expected PdfString but got ${value.type}`,
    });
    return none;
  }
  return decodePdfString(value, key, warnings);
};

/**
 * 日時フィールド共通リーダ。値の型チェック → 文字列復号 → {@link parsePdfDate} を束ねる。
 *
 * `parsePdfDate` は警告 push を行わない pure 関数なので、`none` を検出した時点で
 * 本リーダ（caller）が `DATE_PARSE_FAILED` 警告を push する（review-002 反映）。
 *
 * 分岐:
 *  - 値が `undefined` → `none`（警告なし、未指定扱い）
 *  - 値が PdfString 以外 → `none` + `DATE_PARSE_FAILED` 警告
 *  - 文字列復号失敗 → `none`（警告は decodePdfString 側で push 済み）
 *  - 日時パース失敗 → `none` + `DATE_PARSE_FAILED` 警告
 *
 * @param entries - /Info 辞書のエントリ
 * @param key - 取得するキー（例: `"CreationDate"`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns パース成功時は Option.some(Date)、それ以外は Option.none
 */
const readDateField = (
  entries: Map<string, PdfValue>,
  key: string,
  warnings: PdfWarning[],
): Option<Date> => {
  const value = entries.get(key);
  if (value === undefined) {
    return none;
  }
  if (value.type !== "string") {
    warnings.push({
      code: "DATE_PARSE_FAILED",
      message: `/${key} expected PdfString but got ${value.type}`,
    });
    return none;
  }
  const rawOpt = decodePdfString(value, key, warnings);
  if (!rawOpt.some) {
    return none;
  }
  const parsedOpt = parsePdfDate(rawOpt.value);
  if (!parsedOpt.some) {
    warnings.push({
      code: "DATE_PARSE_FAILED",
      message: `/${key} failed to parse PDF date ${JSON.stringify(rawOpt.value)}; expected pattern D:YYYYMMDDHHmmSSOHH'mm'`,
    });
    return none;
  }
  return parsedOpt;
};

/**
 * `/Info` 辞書から 9 フィールドを抽出して {@link DocumentMetadata} に詰め直す。
 *
 * テキスト 6 フィールド・日時 2 フィールド・Trapped を、それぞれ
 * `readStringField` / `readDateField` / `parseTrappedName` に委譲し、
 * `unwrapOr(opt, undefined)` で展開後、`stripUndefined` でプロパティ非存在化する。
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
  return stripUndefined<DocumentMetadata>({
    title: unwrapOr(readStringField(e, "Title", warnings), undefined),
    author: unwrapOr(readStringField(e, "Author", warnings), undefined),
    subject: unwrapOr(readStringField(e, "Subject", warnings), undefined),
    keywords: unwrapOr(readStringField(e, "Keywords", warnings), undefined),
    creator: unwrapOr(readStringField(e, "Creator", warnings), undefined),
    producer: unwrapOr(readStringField(e, "Producer", warnings), undefined),
    creationDate: unwrapOr(
      readDateField(e, "CreationDate", warnings),
      undefined,
    ),
    modDate: unwrapOr(readDateField(e, "ModDate", warnings), undefined),
    trapped: unwrapOr(parseTrappedName(e.get("Trapped"), warnings), undefined),
  });
};

/**
 * トレーラ辞書の `/Info` 間接参照を解決し、{@link DocumentMetadata} を抽出する
 * companion object。ISO 32000-2:2020 § 14.3.3 (Document Information Dictionary) 準拠。
 *
 * すべての失敗は warning に降格されるため、この companion object は失敗しない。
 *
 * 分岐:
 *  - `/Info` 不在 → 空 metadata + 空 warnings
 *  - resolver 失敗 → `INFO_RESOLVE_FAILED` 警告 + 空 metadata
 *  - 解決値が dictionary 以外 → `INFO_NOT_DICTIONARY` 警告 + 空 metadata
 *  - 辞書あり → 9 フィールドを抽出して返す
 */
export const DocumentInfoParser = {
  /**
   * `/Info` 辞書から PDF ドキュメントメタデータを抽出する。
   *
   * @param trailerDict - trailer parser 出力（`info` は IndirectRef または undefined）
   * @param resolveRef - 間接参照を解決する関数
   * @returns 抽出したメタデータと、抽出中に蓄積された警告
   */
  async parse(
    trailerDict: TrailerDict,
    resolveRef: ResolveRef,
  ): Promise<ParsedDocumentInfo> {
    const warnings: PdfWarning[] = [];
    if (trailerDict.info === undefined) {
      return { metadata: EMPTY_METADATA, warnings };
    }
    const resolved = await resolveRef(trailerDict.info);
    if (!resolved.ok) {
      warnings.push({
        code: "INFO_RESOLVE_FAILED",
        message: `Failed to resolve /Info ${trailerDict.info.objectNumber} ${trailerDict.info.generationNumber}: cause=${resolved.error.code}, message=${resolved.error.message}`,
      });
      return { metadata: EMPTY_METADATA, warnings };
    }
    if (resolved.value.type !== "dictionary") {
      warnings.push({
        code: "INFO_NOT_DICTIONARY",
        message: `Trailer /Info did not resolve to a dictionary (got: ${resolved.value.type})`,
      });
      return { metadata: EMPTY_METADATA, warnings };
    }
    const metadata = extractMetadata(resolved.value, warnings);
    return { metadata, warnings };
  },
} as const;
