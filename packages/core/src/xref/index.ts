/**
 * PDF相互参照テーブル処理モジュール。
 * startxrefオフセットの走査およびxrefテーブル解析機能を提供する。
 */
export { scanStartXRef } from "./startxref-scanner.js";
export { parseXRefTable } from "./xref-table-parser.js";
