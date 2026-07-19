/**
 * クロスリファレンスストリーム辞書（`/Type /XRef`, ISO 32000-1 §7.5.8 Table 17）の
 * `/Type` `/W` `/Size` `/Index` `/Filter` `/DecodeParms` を検証・抽出するモジュール。
 *
 * @module
 */

import type { PdfParseError } from "../../../pdf/errors/index";
import { PdfFilter } from "../../../pdf/filter/index";
import { PdfType } from "../../../pdf/types/pdf-type/index";
import type { PdfValue } from "../../../pdf/types/pdf-types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

const W_ARRAY_LENGTH = 3;

/** `XRefStreamDict.parse` が返す、xref ストリーム辞書から抽出した情報。 */
export interface XRefStreamDictInfo {
  /** `/W` 配列 [typeWidth, field2Width, field3Width] */
  readonly w: readonly [number, number, number];
  /** `/Size` */
  readonly size: number;
  /** `/Index`（省略時は `undefined`） */
  readonly index: readonly number[] | undefined;
  /** `/Filter`（省略時は `undefined`） */
  readonly filterName: string | undefined;
  /** `/DecodeParms`（辞書形式のみサポート、省略時は `undefined`） */
  readonly decodeParms: ReadonlyMap<string, PdfValue> | undefined;
}

/**
 * xref ストリーム辞書バリデーション失敗時の Err を生成する。
 *
 * @param message - エラーメッセージ
 * @returns `XREF_STREAM_INVALID` コードを持つ Err
 */
function failDict(message: string): Result<never, PdfParseError> {
  return err({ code: "XREF_STREAM_INVALID", message });
}

/**
 * `/W` エントリを検証し `readonly [number, number, number]` として取得する。
 *
 * @param entries - ストリーム辞書のエントリ
 * @returns 検証済みの `/W` タプル、またはエラー
 */
function readW(
  entries: Map<string, PdfValue>,
): Result<readonly [number, number, number], PdfParseError> {
  const entry = entries.get("W");
  if (entry === undefined || entry.type !== "array") {
    return failDict("XRef stream dictionary missing /W array");
  }
  if (entry.elements.length !== W_ARRAY_LENGTH) {
    return failDict(
      `/W array must have exactly 3 elements, got ${entry.elements.length}`,
    );
  }
  const values: number[] = [];
  for (const el of entry.elements) {
    if (el.type !== "integer") {
      return failDict("/W array elements must be integers");
    }
    values.push(el.value);
  }
  return ok([values[0], values[1], values[2]]);
}

/**
 * `/Size` エントリを検証し整数として取得する。
 *
 * @param entries - ストリーム辞書のエントリ
 * @returns `/Size` の整数値、またはエラー
 */
function readSize(
  entries: Map<string, PdfValue>,
): Result<number, PdfParseError> {
  const entry = entries.get("Size");
  if (entry === undefined || entry.type !== "integer") {
    return failDict("XRef stream dictionary missing /Size integer");
  }
  return ok(entry.value);
}

/**
 * `/Index` エントリを検証し整数配列として取得する（省略時は `undefined`）。
 *
 * @param entries - ストリーム辞書のエントリ
 * @returns `/Index` の整数配列、`undefined`、またはエラー
 */
function readIndex(
  entries: Map<string, PdfValue>,
): Result<readonly number[] | undefined, PdfParseError> {
  const entry = entries.get("Index");
  if (entry === undefined) {
    return ok(undefined);
  }
  if (entry.type !== "array") {
    return failDict("/Index must be an array");
  }
  const values: number[] = [];
  for (const el of entry.elements) {
    if (el.type !== "integer") {
      return failDict("/Index array elements must be integers");
    }
    values.push(el.value);
  }
  return ok(values);
}

/**
 * `/DecodeParms` エントリを検証し辞書エントリマップとして取得する（省略時は `undefined`）。
 * 配列形式（複数フィルタ用）は未サポート。
 *
 * @param entries - ストリーム辞書のエントリ
 * @returns `/DecodeParms` の辞書エントリマップ、`undefined`、またはエラー
 */
function readDecodeParms(
  entries: Map<string, PdfValue>,
): Result<ReadonlyMap<string, PdfValue> | undefined, PdfParseError> {
  const entry = entries.get("DecodeParms");
  if (entry === undefined) {
    return ok(undefined);
  }
  if (entry.type !== "dictionary") {
    return failDict(
      "/DecodeParms must be a dictionary (array form is not supported)",
    );
  }
  return ok(entry.entries);
}

/** クロスリファレンスストリーム辞書のバリデーションを行うコンパニオンオブジェクト。 */
export const XRefStreamDict = {
  /**
   * xref ストリーム辞書をパースし、`/Type` `/W` `/Size` `/Index` `/Filter` `/DecodeParms` を検証・抽出する。
   *
   * 内部で呼び出す `PdfType.validate` / `PdfFilter.parse` 由来のエラーは
   * `XREF_STREAM_INVALID` に再ラップする（元の `message` / `offset` は保持）。
   *
   * @param entries - ストリーム辞書のエントリ
   * @returns パース済み辞書情報、または `XREF_STREAM_INVALID` エラー
   */
  parse(
    entries: Map<string, PdfValue>,
  ): Result<XRefStreamDictInfo, PdfParseError> {
    const typeError = PdfType.validate(entries, "XRef");
    if (typeError.some) {
      return err({ ...typeError.value, code: "XREF_STREAM_INVALID" });
    }

    const wResult = readW(entries);
    if (!wResult.ok) {
      return wResult;
    }

    const sizeResult = readSize(entries);
    if (!sizeResult.ok) {
      return sizeResult;
    }

    const indexResult = readIndex(entries);
    if (!indexResult.ok) {
      return indexResult;
    }

    const filterResult = PdfFilter.parse(entries);
    if (!filterResult.ok) {
      return err({ ...filterResult.error, code: "XREF_STREAM_INVALID" });
    }

    const decodeParmsResult = readDecodeParms(entries);
    if (!decodeParmsResult.ok) {
      return decodeParmsResult;
    }

    return ok({
      w: wResult.value,
      size: sizeResult.value,
      index: indexResult.value,
      filterName: filterResult.value,
      decodeParms: decodeParmsResult.value,
    });
  },
} as const;
