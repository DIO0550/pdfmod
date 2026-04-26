import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfValue } from "../pdf/types/pdf-types/index";
import type { Brand } from "../utils/brand/index";
import type { Result } from "../utils/result/index";
import { err, ok } from "../utils/result/index";

declare const PdfTrappedBrand: unique symbol;

/**
 * /Trapped 値を表すブランド型（ISO 32000-2:2020 § 14.3.3）。
 * `PdfTrapped.create` を通じてのみ構築可能で、"True" / "False" / "Unknown" のみ受理する。
 */
type PdfTrapped = Brand<"True" | "False" | "Unknown", typeof PdfTrappedBrand>;

const TRAPPED_ALLOWED = ["True", "False", "Unknown"] as const;

const PdfTrapped = {
  /**
   * 文字列から `PdfTrapped` を構築する。
   *
   * @param s - "True" / "False" / "Unknown" のいずれか（大文字小文字区別）
   * @returns 集合に属すれば `Ok<PdfTrapped>`、属さなければ `Err<string>`
   */
  create(s: string): Result<PdfTrapped, string> {
    if (!(TRAPPED_ALLOWED as readonly string[]).includes(s)) {
      return err(
        `Invalid PdfTrapped: "${s}" (supported: ${TRAPPED_ALLOWED.join(", ")})`,
      );
    }
    return ok(s as PdfTrapped);
  },
} as const;

export { PdfTrapped };

/**
 * PdfValue の診断用要約を生成する。
 * 警告メッセージで「実値が分かる形」で残すために使う。
 *
 * @param value - 要約対象の PdfValue
 * @returns 値の種別ごとの簡潔な文字列表現
 */
const summarizePdfValue = (value: PdfValue): string => {
  switch (value.type) {
    case "null":
      return "null";
    case "boolean":
      return String(value.value);
    case "integer":
      return String(value.value);
    case "real":
      return String(value.value);
    case "string":
      return `<bytes len=${value.value.length} enc=${value.encoding}>`;
    case "name":
      return `'${value.value}'`;
    case "array":
      return `<array length=${value.elements.length}>`;
    case "dictionary":
      return `<dict size=${value.entries.size}>`;
    case "indirect-ref":
      return `<ref ${value.objectNumber} ${value.generationNumber}>`;
  }
};

/**
 * PDF ドキュメントの /Info 由来メタデータ。
 * ISO 32000-2:2020 § 14.3.3 (Document Information Dictionary) 準拠。
 *
 * 全フィールド optional。/Info 不在・抽出失敗時は undefined。
 */
export interface DocumentMetadata {
  /** /Title — ドキュメントのタイトル */
  readonly title?: string;
  /** /Author — ドキュメントの作成者 */
  readonly author?: string;
  /** /Subject — ドキュメントのサブジェクト */
  readonly subject?: string;
  /** /Keywords — ドキュメントに関連するキーワード */
  readonly keywords?: string;
  /** /Creator — オリジナル作成アプリケーション */
  readonly creator?: string;
  /** /Producer — PDF 生成プロダクト */
  readonly producer?: string;
  /** /CreationDate — 作成日時 */
  readonly creationDate?: Date;
  /** /ModDate — 最終更新日時 */
  readonly modDate?: Date;
  /** /Trapped — 印刷品質に関するトラッピング情報 */
  readonly trapped?: PdfTrapped;
}

/**
 * /Trapped の Name 値を {@link PdfTrapped} リテラルに解釈する。
 *
 * - value が undefined → undefined（警告なし）
 * - value が PdfName で値が "True" / "False" / "Unknown" → 該当 literal
 * - 上記以外 → undefined + TRAPPED_INVALID 警告
 *
 * @param value - /Trapped の値（解決済みの PdfValue または undefined）
 * @param warnings - 警告蓄積先（mutable）
 * @returns PdfTrapped または undefined
 */
export const parseTrappedName = (
  value: PdfValue | undefined,
  warnings: PdfWarning[],
): PdfTrapped | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value.type !== "name") {
    warnings.push({
      code: "TRAPPED_INVALID",
      message: `/Trapped expected Name but got ${value.type} (${summarizePdfValue(value)})`,
    });
    return undefined;
  }
  const result = PdfTrapped.create(value.value);
  if (!result.ok) {
    warnings.push({
      code: "TRAPPED_INVALID",
      message: `/Trapped value '${value.value}' is not in {True, False, Unknown}`,
    });
    return undefined;
  }
  return result.value;
};
