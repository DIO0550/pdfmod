/**
 * オブジェクトストリーム (`/Type /ObjStm`, ISO 32000-1 §7.5.7) の中身から指定 `ObjectNumber` のオブジェクトを切り出すモジュール。
 * 辞書検証 (`/First` / `/N` / `/Filter`) → 必要に応じて FlateDecode 展開 → オフセットテーブル (`ObjectStreamHeader`) パース → 単位データの再パース (`ObjectParser.parse`) を担う。
 *
 * @module
 */

export { ObjectStreamBody } from "./body/index";
export type { ObjectStreamHeaderEntry } from "./header/index";
export { ObjectStreamHeader } from "./header/index";
export type { StreamResolver } from "./types";
