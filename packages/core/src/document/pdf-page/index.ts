import type { IndirectRef } from "../../pdf/types/indirect-ref/index";
import {
  PAGE_ROTATE_90,
  PAGE_ROTATE_270,
  type PageRotate,
  type ResolvedPage,
} from "../page-tree/resolved-page";

/**
 * `PdfPage` の `mediaBox` / `cropBox` で公開する readonly タプル型。
 */
export type PdfPageRectangle = readonly [number, number, number, number];

/**
 * `PdfPage` の private constructor が instance に assign する fields。
 */
interface PdfPageFields {
  readonly mediaBox: PdfPageRectangle;
  readonly cropBox: PdfPageRectangle;
  readonly rotate: PageRotate;
  readonly userUnit: number;
  readonly ref: IndirectRef;
  readonly width: number;
  readonly height: number;
}

/**
 * 1 ページを表すクラス。`ResolvedPage` をラップし、Rotate / userUnit を
 * 考慮した width / height を算出して公開する。
 *
 * - PP-001: rotate ∈ {0, 180} → width = urx-llx, height = ury-lly
 * - PP-002: rotate ∈ {90, 270} → width = ury-lly, height = urx-llx
 * - PP-003: 上記に userUnit を乗算
 */
export class PdfPage {
  readonly mediaBox: PdfPageRectangle;
  readonly cropBox: PdfPageRectangle;
  readonly rotate: PageRotate;
  readonly userUnit: number;
  readonly ref: IndirectRef;
  readonly width: number;
  readonly height: number;

  private constructor(fields: PdfPageFields) {
    this.mediaBox = fields.mediaBox;
    this.cropBox = fields.cropBox;
    this.rotate = fields.rotate;
    this.userUnit = fields.userUnit;
    this.ref = fields.ref;
    this.width = fields.width;
    this.height = fields.height;
  }

  /**
   * `ResolvedPage` から `PdfPage` を構築する。
   * `ResolvedPage` は上流（`PageTreeWalker` / `AttrResolver`）でバリデート
   * 済みのため失敗パスはなく、直接 `PdfPage` を返す。
   *
   * @param resolved - 上流で正規化済みの `ResolvedPage`
   * @returns 構築された `PdfPage`
   */
  static from(resolved: ResolvedPage): PdfPage {
    const [llx, lly, urx, ury] = resolved.mediaBox;
    const horizontal = urx - llx;
    const vertical = ury - lly;

    let baseWidth: number;
    let baseHeight: number;
    if (
      resolved.rotate === PAGE_ROTATE_90 ||
      resolved.rotate === PAGE_ROTATE_270
    ) {
      baseWidth = vertical;
      baseHeight = horizontal;
    } else {
      baseWidth = horizontal;
      baseHeight = vertical;
    }

    const width = baseWidth * resolved.userUnit;
    const height = baseHeight * resolved.userUnit;

    return new PdfPage({
      mediaBox: resolved.mediaBox,
      cropBox: resolved.cropBox,
      rotate: resolved.rotate,
      userUnit: resolved.userUnit,
      ref: resolved.objectRef,
      width,
      height,
    });
  }
}
