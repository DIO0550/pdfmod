import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
} from "../../pdf/types/pdf-types/index";

/**
 * PDF の rectangle 型。
 * `[llx, lly, urx, ury]` の 4 要素配列で、左下と右上の座標を表す
 * （ISO 32000-2:2020 § 7.9.5）。
 */
export type PdfRectangle = [number, number, number, number];

/** PDF ページ回転角度: 無回転。 */
export const PAGE_ROTATE_0 = 0;
/** PDF ページ回転角度: 90 度。 */
export const PAGE_ROTATE_90 = 90;
/** PDF ページ回転角度: 180 度。 */
export const PAGE_ROTATE_180 = 180;
/** PDF ページ回転角度: 270 度。 */
export const PAGE_ROTATE_270 = 270;

/** 0/90/180/270 に正規化された回転角度。 */
export type PageRotate =
  | typeof PAGE_ROTATE_0
  | typeof PAGE_ROTATE_90
  | typeof PAGE_ROTATE_180
  | typeof PAGE_ROTATE_270;

/**
 * 継承解決済みのページ属性。PageTreeWalker が葉ノードごとに生成する。
 */
export interface ResolvedPage {
  /** ページの物理的寸法 [llx, lly, urx, ury]（ポイント単位） */
  mediaBox: PdfRectangle;
  /** 描画リソース辞書（未継承時は空辞書） */
  resources: PdfDictionary;
  /** トリミング領域（未指定時は mediaBox と同一） */
  cropBox: PdfRectangle;
  /** 表示時の回転角度（0/90/180/270 に正規化済み） */
  rotate: PageRotate;
  /** コンテンツストリーム参照 */
  contents: IndirectRef | IndirectRef[] | null;
  /** アノテーション配列 */
  annots: PdfObject[] | null;
  /** ユーザー空間の単位倍率（デフォルト 1.0） */
  userUnit: number;
  /** 元のページオブジェクトへの参照（ブランド済み） */
  objectRef: IndirectRef;
}
