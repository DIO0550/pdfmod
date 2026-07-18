/**
 * ページツリー（`/Pages` ノード）を走査し、継承属性（MediaBox/Resources 等）を解決するモジュール群を公開するバレル。
 *
 * @module
 */

export type {
  InheritedAttrs,
  ResolveInheritedOutcome,
} from "./inheritance-resolver";
export { InheritanceResolver } from "./inheritance-resolver";
export type { WalkPageTreeResult } from "./page-tree-walker";
export { PageTreeWalker } from "./page-tree-walker";
export type { PageRotate, PdfRectangle, ResolvedPage } from "./resolved-page";
