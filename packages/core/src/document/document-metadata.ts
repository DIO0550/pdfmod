/**
 * /Trapped の許可値（ISO 32000-2:2020 § 14.3.3）。
 */
export type TrappedState = "True" | "False" | "Unknown";

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
  readonly trapped?: TrappedState;
}
