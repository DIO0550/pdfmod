/**
 * `/DecodeParms` の `/Predictor` (ISO 32000-1 §7.4.4.4) を扱うモジュール。
 * FlateDecode 展開後のバイト列に対し、PNG 予測子 (10-15) / TIFF 予測子 (2) の逆変換を行う。
 *
 * @module
 */

import { NumberEx } from "../../../ext/number/index";
import type { PdfParseError } from "../../../pdf/errors/index";
import type { PdfValue } from "../../../pdf/types/pdf-types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

const DEFAULT_PREDICTOR = 1;
const DEFAULT_COLORS = 1;
const DEFAULT_BITS_PER_COMPONENT = 8;
const DEFAULT_COLUMNS = 1;
const TIFF_BYTE_ALIGNED_BITS_PER_COMPONENT = 8;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 0xff;
const TIFF_PREDICTOR = 2;
const PNG_PREDICTOR_MIN = 10;
const PNG_PREDICTOR_MAX = 15;
const BITS_PER_COMPONENT_1 = 1;
const BITS_PER_COMPONENT_2 = 2;
const BITS_PER_COMPONENT_4 = 4;
const BITS_PER_COMPONENT_8 = 8;
const BITS_PER_COMPONENT_16 = 16;
const VALID_BITS_PER_COMPONENT = new Set([
  BITS_PER_COMPONENT_1,
  BITS_PER_COMPONENT_2,
  BITS_PER_COMPONENT_4,
  BITS_PER_COMPONENT_8,
  BITS_PER_COMPONENT_16,
]);

/** PNG 予測子 (ISO 32000-1 Table 8) の行タグ値。 */
const PngTag = {
  None: 0,
  Sub: 1,
  Up: 2,
  Average: 3,
  Paeth: 4,
} as const;

/** `/DecodeParms` から読み取る Predictor 関連パラメータ。 */
export interface PredictorParams {
  /** `/Predictor` (既定値 1: 予測子なし) */
  readonly predictor: number;
  /** `/Colors` (既定値 1) */
  readonly colors: number;
  /** `/BitsPerComponent` (既定値 8) */
  readonly bitsPerComponent: number;
  /** `/Columns` (既定値 1) */
  readonly columns: number;
}

/**
 * Predictor 関連パラメータ検証失敗時の Err を生成する。
 *
 * @param message - エラーメッセージ
 * @returns `XREF_STREAM_INVALID` コードを持つ Err
 */
function failPredictor(message: string): Result<never, PdfParseError> {
  return err({ code: "XREF_STREAM_INVALID", message });
}

/**
 * `/DecodeParms` の整数エントリを読み取る。未指定ならデフォルト値を返す。
 *
 * @param decodeParms - `/DecodeParms` 辞書のエントリ
 * @param key - 読み取るキー名
 * @param defaultValue - 未指定時のデフォルト値
 * @returns 読み取った整数値、または型不正時のエラー
 */
function readIntEntry(
  decodeParms: ReadonlyMap<string, PdfValue>,
  key: string,
  defaultValue: number,
): Result<number, PdfParseError> {
  const entry = decodeParms.get(key);
  if (entry === undefined) {
    return ok(defaultValue);
  }
  if (entry.type !== "integer") {
    return failPredictor(`/DecodeParms /${key} must be an integer`);
  }
  return ok(entry.value);
}

/**
 * PNG 予測子 (tag=4) の Paeth 予測子。
 *
 * @param a - 左バイト
 * @param b - 直上バイト
 * @param c - 左上バイト
 * @returns a/b/c のうち予測値に最も近いもの
 */
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

/**
 * PNG 予測子の1バイトを復元する。
 *
 * @param tag - 行タグ (0-4)
 * @param raw - 符号化済みバイト
 * @param a - 左バイト（復元済み）
 * @param b - 直上バイト（復元済み）
 * @param c - 左上バイト（復元済み）
 * @returns 復元したバイト値、または未知タグ時のエラー
 */
function decodePngByte(
  tag: number,
  raw: number,
  a: number,
  b: number,
  c: number,
): Result<number, PdfParseError> {
  switch (tag) {
    case PngTag.None:
      return ok(raw);
    case PngTag.Sub:
      return ok((raw + a) & BYTE_MASK);
    case PngTag.Up:
      return ok((raw + b) & BYTE_MASK);
    case PngTag.Average:
      return ok((raw + Math.floor((a + b) / 2)) & BYTE_MASK);
    case PngTag.Paeth:
      return ok((raw + paethPredictor(a, b, c)) & BYTE_MASK);
    default:
      return failPredictor(`unknown PNG predictor tag: ${tag}`);
  }
}

/**
 * PNG 予測子 (Predictor 10-15) の逆変換を行う。
 * 各行の先頭1バイトがタグ、残り `rowBytes` バイトが符号化済みサンプルという構造を前提とする。
 *
 * @param data - FlateDecode 展開済みのバイト列
 * @param bpp - 1サンプルあたりのバイト数（`ceil(colors * bitsPerComponent / 8)`、最小1）
 * @param rowBytes - 1行あたりのサンプルバイト数（タグを除く）
 * @returns 復元したバイト列、またはエラー
 */
function applyPngPredictor(
  data: Uint8Array,
  bpp: number,
  rowBytes: number,
): Result<Uint8Array, PdfParseError> {
  const recordSize = rowBytes + 1;
  if (recordSize <= 0 || data.length % recordSize !== 0) {
    return failPredictor(
      `PNG predictor data length ${data.length} is not a multiple of record size ${recordSize}`,
    );
  }

  const rows = data.length / recordSize;
  const output = new Uint8Array(rows * rowBytes);
  let prevRowStart = -1;

  for (let row = 0; row < rows; row++) {
    const recordStart = row * recordSize;
    const tag = data[recordStart];
    const rowStart = row * rowBytes;

    for (let i = 0; i < rowBytes; i++) {
      const raw = data[recordStart + 1 + i];
      const a = i >= bpp ? output[rowStart + i - bpp] : 0;
      const b = prevRowStart >= 0 ? output[prevRowStart + i] : 0;
      const c =
        prevRowStart >= 0 && i >= bpp ? output[prevRowStart + i - bpp] : 0;

      const decoded = decodePngByte(tag, raw, a, b, c);
      if (!decoded.ok) {
        return decoded;
      }
      output[rowStart + i] = decoded.value;
    }

    prevRowStart = rowStart;
  }

  return ok(output);
}

/**
 * TIFF 予測子 (Predictor 2) の逆変換を行う。バイト境界を前提とするため
 * `bitsPerComponent` が 8 以外の場合はエラーを返す。
 *
 * @param data - FlateDecode 展開済みのバイト列
 * @param colors - 1サンプルあたりのカラーコンポーネント数
 * @param bitsPerComponent - 1コンポーネントあたりのビット数
 * @param columns - 1行あたりのサンプル数
 * @returns 復元したバイト列、またはエラー
 */
function applyTiffPredictor(
  data: Uint8Array,
  colors: number,
  bitsPerComponent: number,
  columns: number,
): Result<Uint8Array, PdfParseError> {
  if (bitsPerComponent !== TIFF_BYTE_ALIGNED_BITS_PER_COMPONENT) {
    return failPredictor(
      `TIFF predictor (2) only supports /BitsPerComponent 8, got ${bitsPerComponent}`,
    );
  }

  const rowBytes = colors * columns;
  if (rowBytes <= 0 || data.length % rowBytes !== 0) {
    return failPredictor(
      `TIFF predictor data length ${data.length} is not a multiple of row size ${rowBytes}`,
    );
  }

  const rows = data.length / rowBytes;
  const output = new Uint8Array(data.length);

  for (let row = 0; row < rows; row++) {
    const rowStart = row * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const raw = data[rowStart + i];
      const left = i >= colors ? output[rowStart + i - colors] : 0;
      output[rowStart + i] = (raw + left) & BYTE_MASK;
    }
  }

  return ok(output);
}

/** `/DecodeParms` の Predictor 系パラメータ検証・逆変換を担うコンパニオンオブジェクト。 */
export const Predictor = {
  /**
   * `/DecodeParms` 辞書エントリから Predictor 関連パラメータを読み取る。
   * 未指定キーには ISO 32000-1 Table 8 のデフォルト値を適用する。
   *
   * @param decodeParms - `/DecodeParms` 辞書のエントリ（未指定時は全デフォルト値）
   * @returns 検証済みの `PredictorParams`、または `XREF_STREAM_INVALID` エラー
   */
  parseParams(
    decodeParms: ReadonlyMap<string, PdfValue> | undefined,
  ): Result<PredictorParams, PdfParseError> {
    if (decodeParms === undefined) {
      return ok({
        predictor: DEFAULT_PREDICTOR,
        colors: DEFAULT_COLORS,
        bitsPerComponent: DEFAULT_BITS_PER_COMPONENT,
        columns: DEFAULT_COLUMNS,
      });
    }

    const predictorResult = readIntEntry(
      decodeParms,
      "Predictor",
      DEFAULT_PREDICTOR,
    );
    if (!predictorResult.ok) {
      return predictorResult;
    }
    const colorsResult = readIntEntry(decodeParms, "Colors", DEFAULT_COLORS);
    if (!colorsResult.ok) {
      return colorsResult;
    }
    const bitsPerComponentResult = readIntEntry(
      decodeParms,
      "BitsPerComponent",
      DEFAULT_BITS_PER_COMPONENT,
    );
    if (!bitsPerComponentResult.ok) {
      return bitsPerComponentResult;
    }
    const columnsResult = readIntEntry(decodeParms, "Columns", DEFAULT_COLUMNS);
    if (!columnsResult.ok) {
      return columnsResult;
    }

    if (!NumberEx.isPositiveSafeInteger(predictorResult.value)) {
      return failPredictor(
        `/Predictor must be a positive safe integer, got ${predictorResult.value}`,
      );
    }
    if (!NumberEx.isPositiveSafeInteger(colorsResult.value)) {
      return failPredictor(
        `/Colors must be a positive safe integer, got ${colorsResult.value}`,
      );
    }
    if (!VALID_BITS_PER_COMPONENT.has(bitsPerComponentResult.value)) {
      return failPredictor(
        `/BitsPerComponent must be one of 1,2,4,8,16, got ${bitsPerComponentResult.value}`,
      );
    }
    if (!NumberEx.isPositiveSafeInteger(columnsResult.value)) {
      return failPredictor(
        `/Columns must be a positive safe integer, got ${columnsResult.value}`,
      );
    }

    return ok({
      predictor: predictorResult.value,
      colors: colorsResult.value,
      bitsPerComponent: bitsPerComponentResult.value,
      columns: columnsResult.value,
    });
  },

  /**
   * FlateDecode 展開済みのバイト列に Predictor 逆変換を適用する。
   * `predictor === 1` の場合は入力をそのまま返す。
   *
   * @param data - FlateDecode 展開済みのバイト列
   * @param params - `parseParams` で得た Predictor パラメータ
   * @returns 逆変換後のバイト列、またはエラー
   */
  apply(
    data: Uint8Array,
    params: PredictorParams,
  ): Result<Uint8Array, PdfParseError> {
    if (params.predictor === DEFAULT_PREDICTOR) {
      return ok(data);
    }

    if (params.predictor === TIFF_PREDICTOR) {
      return applyTiffPredictor(
        data,
        params.colors,
        params.bitsPerComponent,
        params.columns,
      );
    }

    if (
      params.predictor >= PNG_PREDICTOR_MIN &&
      params.predictor <= PNG_PREDICTOR_MAX
    ) {
      const bpp = Math.max(
        1,
        Math.ceil((params.colors * params.bitsPerComponent) / BITS_PER_BYTE),
      );
      const rowBytes = Math.ceil(
        (params.colors * params.bitsPerComponent * params.columns) /
          BITS_PER_BYTE,
      );
      return applyPngPredictor(data, bpp, rowBytes);
    }

    return failPredictor(`unsupported /Predictor value: ${params.predictor}`);
  },
} as const;
