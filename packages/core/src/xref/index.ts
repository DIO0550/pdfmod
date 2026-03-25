/**
 * PDF相互参照テーブル処理モジュール。
 * startxrefオフセットの走査、xrefテーブル解析、およびtrailer辞書解析機能を提供する。
 */
export { scanStartXRef } from "./startxref/index.js";
export { parseXRefTable } from "./table/index.js";
export { parseTrailer } from "./trailer/index.js";
