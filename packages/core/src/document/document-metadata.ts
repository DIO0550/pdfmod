import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfValue } from "../pdf/types/pdf-types/index";

/**
 * `/Trapped` の許可値（ISO 32000-2:2020 § 14.3.3）。
 */
export type TrappedState = "True" | "False" | "Unknown";

/**
 * PDF ドキュメントの `/Info` 由来メタデータ。
 * ISO 32000-2:2020 § 14.3.3 (Document Information Dictionary) 準拠。
 *
 * 全フィールド optional。`/Info` 不在・抽出失敗時は `undefined`。
 */
export interface DocumentMetadata {
  /** `/Title` — ドキュメントのタイトル */
  readonly title?: string;
  /** `/Author` — ドキュメントの作成者 */
  readonly author?: string;
  /** `/Subject` — ドキュメントのサブジェクト */
  readonly subject?: string;
  /** `/Keywords` — ドキュメントに関連するキーワード */
  readonly keywords?: string;
  /** `/Creator` — オリジナル作成アプリケーション */
  readonly creator?: string;
  /** `/Producer` — PDF 生成プロダクト */
  readonly producer?: string;
  /** `/CreationDate` — 作成日時 */
  readonly creationDate?: Date;
  /** `/ModDate` — 最終更新日時 */
  readonly modDate?: Date;
  /** `/Trapped` — 印刷品質に関するトラッピング情報 */
  readonly trapped?: TrappedState;
}

/** 内部利用: 許可される `/Trapped` 値の不変リスト。 */
const TRAPPED_ALLOWED = ["True", "False", "Unknown"] as const;

/**
 * 文字列が {@link TrappedState} のリテラル値かを判定する型ガード。
 *
 * @param s - 検査対象文字列
 * @returns 許可リストに含まれる場合 true
 */
const isTrappedLiteral = (s: string): s is TrappedState => {
  return (TRAPPED_ALLOWED as readonly string[]).includes(s);
};

/**
 * `/Trapped` の Name 値を {@link TrappedState} リテラルに解釈する。
 *
 * - `value` が `undefined` → `undefined`（警告なし、未指定扱い）
 * - PdfName で値が `"True"` / `"False"` / `"Unknown"` → 該当リテラル
 * - PdfName だが未知の値 → `undefined` + `TRAPPED_INVALID` 警告
 * - PdfName 以外の型 → `undefined` + `TRAPPED_INVALID` 警告
 *
 * 大文字小文字を区別する（`"true"` は不正）。
 *
 * @param value - 辞書から取得した PdfValue（または未指定時 `undefined`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns 解釈成功時は {@link TrappedState}、失敗時は `undefined`
 */
export const parseTrappedName = (
  value: PdfValue | undefined,
  warnings: PdfWarning[],
): TrappedState | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value.type !== "name") {
    warnings.push({
      code: "TRAPPED_INVALID",
      message: `/Trapped expected Name but got ${value.type}`,
    });
    return undefined;
  }
  if (!isTrappedLiteral(value.value)) {
    warnings.push({
      code: "TRAPPED_INVALID",
      message: `/Trapped value '${value.value}' is not in {True, False, Unknown}`,
    });
    return undefined;
  }
  return value.value;
};
