/**
 * クロスリファレンスストリーム（`/Type /XRef`, ISO 32000-1 §7.5.8）のエントリ解析・トレーラ辞書構築を公開するバレル。
 *
 * @module
 */

export { parseXRefStream } from "./parse-xref-stream/index";
export { decodeXRefStreamEntries } from "./parser/index";
export { buildXRefStreamTrailerDict } from "./trailer/index";
