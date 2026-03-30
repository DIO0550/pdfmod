/**
 * PDF相互参照テーブル処理モジュール。
 * startxrefオフセットの走査、xrefテーブル解析、xrefストリームデコード、
 * およびtrailer辞書解析機能を提供する。
 */

export { mergeXRefChain } from "./merger/index";
export { scanStartXRef } from "./startxref/index";
export {
  buildXRefStreamTrailerDict,
  decodeXRefStreamEntries,
  decompressFlate,
} from "./stream/index";
export { parseXRefTable } from "./table/index";
export { parseTrailer, trailerDictBuilder } from "./trailer/index";
