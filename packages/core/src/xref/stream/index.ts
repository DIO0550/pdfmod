/**
 * クロスリファレンスストリーム（`/Type /XRef`, ISO 32000-1 §7.5.8）のFlateDecode展開・エントリ解析・トレーラ辞書構築を公開するバレル。
 *
 * @module
 */

export { decompressFlate } from "./flatedecode/index";
export { decodeXRefStreamEntries } from "./parser/index";
export { buildXRefStreamTrailerDict } from "./trailer/index";
