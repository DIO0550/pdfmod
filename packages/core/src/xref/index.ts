/**
 * PDF相互参照テーブル処理モジュール。
 * startxrefオフセットの走査、xrefテーブル解析、およびtrailer辞書解析機能を提供する。
 */
export { scanStartXRef } from "./startxref/index";
export { parseXRefTable } from "./table/index";
export { parseTrailer } from "./trailer/index";
