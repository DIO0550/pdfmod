import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
} from "../../../pdf/types/pdf-types/index";
import type { Option } from "../../../utils/option/index";

/**
 * PDF の rectangle 型。
 * `[llx, lly, urx, ury]` の 4 要素配列で、左下と右上の座標を表す
 * （ISO 32000-2:2020 § 7.9.5）。
 * `PdfRectangle.normalize` を経由した値は `llx <= urx` かつ `lly <= ury` を満たす
 * （対角逆順で指定されていても左下・右上の順に並べ替えられる）。
 */
export type PdfRectangle = [number, number, number, number];

/**
 * `PdfRectangle` の変換関数を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン
 * (`PdfName` / `IndirectRef` と同流儀)。
 */
export const PdfRectangle = {
  /**
   * 任意の対角 2 点 `[x1, y1, x2, y2]` で指定された矩形を、左下・右上の順
   * `[llx, lly, urx, ury]` に正規化した新しい配列を返す（ISO 32000-1 §7.9.5）。
   * 既に正規形なら同じ値の配列を返す。幅・高さが 0 の退化矩形もそのまま返す。
   * 入力配列は変更しない。
   *
   * @param rect - 任意の対角 2 点で指定された矩形
   * @returns `llx <= urx` かつ `lly <= ury` を満たす新しい PdfRectangle
   */
  normalize(rect: PdfRectangle): PdfRectangle {
    const [x1, y1, x2, y2] = rect;
    const llx = Math.min(x1, x2);
    const lly = Math.min(y1, y2);
    const urx = Math.max(x1, x2);
    const ury = Math.max(y1, y2);
    return [llx, lly, urx, ury];
  },
} as const;

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
  /** ページの物理的寸法 [llx, lly, urx, ury]（ポイント単位、正規化済み） */
  mediaBox: PdfRectangle;
  /** 描画リソース辞書（未継承時は空辞書） */
  resources: PdfDictionary;
  /** トリミング領域（未指定時は mediaBox と同一、正規化済み） */
  cropBox: PdfRectangle;
  /** 表示時の回転角度（0/90/180/270 に正規化済み） */
  rotate: PageRotate;
  /** コンテンツストリーム参照（`/Contents` 不在・不正時は `none`） */
  contents: Option<IndirectRef | IndirectRef[]>;
  /** アノテーション配列（`/Annots` 不在・非配列時は `none`） */
  annots: Option<PdfObject[]>;
  /** ユーザー空間の単位倍率（デフォルト 1.0） */
  userUnit: number;
  /** 元のページオブジェクトへの参照（ブランド済み） */
  objectRef: IndirectRef;
}
