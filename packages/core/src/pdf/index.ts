/**
 * PDFのエラー型・フィルタ・座標系（TextSpace）・基本型・バージョン情報など、PDF処理全体で共有される基礎的な型とユーティリティを束ねるバレル。
 *
 * @module
 */

export * from "./errors/index";
export * from "./filter/index";
export { TextSpace } from "./text-space/index";
export * from "./types/index";
export { PdfVersion } from "./version/index";
