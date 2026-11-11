import type { PdfError } from "../../../pdf/errors/index";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import {
  type PdfDictionary,
  PdfObject,
  type PdfStream,
  ResolveRef,
} from "../../../pdf/types/index";
import { none, type Option, some } from "../../../utils/option/index";
import { ok, type Result } from "../../../utils/result/index";
import type { ValueOf } from "../../../utils/types/utility-type";
import { CoordinateCounts, ResourceParameters } from "../parameters/index";
import { PdfShading } from "../shading/index";

/** ISO 32000 §8.7 のパターン種別。 */
export const PdfPatternTypes = { Tiling: 1, Shading: 2 } as const;
export type PdfPatternType = ValueOf<typeof PdfPatternTypes>;

/** セル内で色を指定するか、呼び出し側から色を渡すか。 */
export const PdfPatternPaintTypes = { Colored: 1, Uncolored: 2 } as const;
export type PdfPatternPaintType = ValueOf<typeof PdfPatternPaintTypes>;

/** セルの間隔と形状を画素へ合わせる方式。 */
export const PdfPatternTilingTypes = {
  ConstantSpacing: 1,
  NoDistortion: 2,
  Faster: 3,
} as const;
export type PdfPatternTilingType = ValueOf<typeof PdfPatternTilingTypes>;

type PatternMatrix = readonly [number, number, number, number, number, number];

/** タイリングはセル、シェーディングは色変化の定義を保持する。 */
export type PdfPattern =
  | {
      readonly patternType: typeof PdfPatternTypes.Tiling;
      readonly stream: PdfStream;
      readonly paintType: PdfPatternPaintType;
      readonly tilingType: PdfPatternTilingType;
      readonly bbox: readonly [number, number, number, number];
      readonly xStep: number;
      readonly yStep: number;
      readonly resources: PdfDictionary;
      readonly matrix: PatternMatrix;
      readonly warnings: readonly PdfWarning[];
    }
  | {
      readonly patternType: typeof PdfPatternTypes.Shading;
      readonly dictionary: PdfDictionary;
      readonly shading: PdfShading;
      readonly extGState: Option<PdfDictionary>;
      readonly matrix: PatternMatrix;
      readonly warnings: readonly PdfWarning[];
    }
  | {
      readonly patternType: "Unknown";
      readonly object: PdfObject;
      readonly warnings: readonly PdfWarning[];
    };

export const PdfPattern = {
  /**
   * パターンの種別と主要属性を間接参照も含めて読む。
   * @param object - /Pattern のローカル名から取得したオブジェクト
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 不正・未知の定義は警告付き Unknown、参照エラーは Err
   */
  async fromObject(
    object: PdfObject,
    resolveRef: ResolveRef,
  ): Promise<Result<PdfPattern, PdfError>> {
    const dictionary = object.type === "stream" ? object.dictionary : object;
    if (dictionary.type !== "dictionary") {
      return ok(PdfPattern.unresolved(object, "PATTERN_INVALID"));
    }

    const type = await ResolveRef.object(
      dictionary.entries.get("PatternType"),
      resolveRef,
    );
    if (!type.ok) {
      return type;
    }

    const patternType =
      type.value.some && type.value.value.type === "integer"
        ? type.value.value.value
        : 0;
    switch (patternType) {
      case PdfPatternTypes.Tiling:
        return PdfPattern.readTiling(object, resolveRef);
      case PdfPatternTypes.Shading:
        return PdfPattern.readShading(dictionary, resolveRef);
      default:
        return ok(PdfPattern.unresolved(object, "PATTERN_UNSUPPORTED"));
    }
  },

  /**
   * セルの属性を読み、必須値の揃ったタイリングパターンを作る。
   * @param object - パターンストリーム候補
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 型・個数・値域が不正なら Unknown、参照エラーは Err
   */
  async readTiling(
    object: PdfObject,
    resolveRef: ResolveRef,
  ): Promise<Result<PdfPattern, PdfError>> {
    if (object.type !== "stream") {
      return ok(PdfPattern.unresolved(object, "PATTERN_INVALID"));
    }

    const fields = await ResourceParameters.resolve(
      object.dictionary,
      [
        "PaintType",
        "TilingType",
        "BBox",
        "XStep",
        "YStep",
        "Resources",
        "Matrix",
      ],
      resolveRef,
    );
    if (!fields.ok) {
      return fields;
    }

    const bbox = await ResourceParameters.coordinates(
      fields.value.get("BBox"),
      CoordinateCounts.Rectangle,
      resolveRef,
    );
    if (!bbox.ok) {
      return bbox;
    }

    const matrix = await PdfPattern.readMatrix(
      fields.value.get("Matrix"),
      resolveRef,
    );
    if (!matrix.ok) {
      return matrix;
    }

    const paint = fields.value.get("PaintType");
    const tiling = fields.value.get("TilingType");
    const paintType =
      paint?.type === "integer" ? PdfPattern.paintType(paint.value) : none;
    const tilingType =
      tiling?.type === "integer" ? PdfPattern.tilingType(tiling.value) : none;
    const x = fields.value.get("XStep");
    const y = fields.value.get("YStep");
    const xStep = x ? PdfObject.asFiniteNumber(x) : none;
    const yStep = y ? PdfObject.asFiniteNumber(y) : none;
    const resources = fields.value.get("Resources");
    const valid =
      paintType.some &&
      tilingType.some &&
      bbox.value.some &&
      matrix.value.some &&
      xStep.some &&
      yStep.some &&
      xStep.value !== 0 &&
      yStep.value !== 0 &&
      resources?.type === "dictionary";
    if (!valid) {
      return ok(PdfPattern.unresolved(object, "PATTERN_INVALID"));
    }

    return ok({
      patternType: PdfPatternTypes.Tiling,
      stream: object,
      paintType: paintType.value,
      tilingType: tilingType.value,
      bbox: bbox.value.value,
      xStep: xStep.value,
      yStep: yStep.value,
      resources,
      matrix: matrix.value.value,
      warnings: [],
    });
  },

  /**
   * シェーディングと任意の拡張状態を取得する。
   * @param dictionary - 種別2のパターン辞書
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns Shading が欠落・属性が不正なら Unknown、参照エラーは Err
   */
  async readShading(
    dictionary: PdfDictionary,
    resolveRef: ResolveRef,
  ): Promise<Result<PdfPattern, PdfError>> {
    const fields = await ResourceParameters.resolve(
      dictionary,
      ["Shading", "ExtGState", "Matrix"],
      resolveRef,
    );
    if (!fields.ok) {
      return fields;
    }

    const matrix = await PdfPattern.readMatrix(
      fields.value.get("Matrix"),
      resolveRef,
    );
    if (!matrix.ok) {
      return matrix;
    }

    const object = fields.value.get("Shading");
    const extended = fields.value.get("ExtGState");
    const invalidExtended =
      extended !== undefined && extended.type !== "dictionary";
    const invalid = !object || !matrix.value.some || invalidExtended;
    if (invalid) {
      return ok(PdfPattern.unresolved(dictionary, "PATTERN_INVALID"));
    }

    const shading = await PdfShading.fromObject(object, resolveRef);
    if (!shading.ok) {
      return shading;
    }

    return ok({
      patternType: PdfPatternTypes.Shading,
      dictionary,
      shading: shading.value,
      extGState: extended?.type === "dictionary" ? some(extended) : none,
      matrix: matrix.value.value,
      warnings: shading.value.warnings,
    });
  },

  /**
   * Matrix の省略を単位行列へ変換する。
   * @param value - 解決済みの Matrix。省略時は undefined
   * @param resolveRef - 配列要素の参照解決関数
   * @returns 省略時は単位行列、不正な配列は None、参照エラーは Err
   */
  async readMatrix(
    value: PdfObject | undefined,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PatternMatrix>, PdfError>> {
    return value === undefined
      ? ok(some([1, 0, 0, 1, 0, 0]))
      : ResourceParameters.coordinates(
          value,
          CoordinateCounts.Matrix,
          resolveRef,
        );
  },

  /**
   * @param value - PaintType の整数
   * @returns 1・2以外は None
   */
  paintType(value: number): Option<PdfPatternPaintType> {
    const valid =
      value === PdfPatternPaintTypes.Colored ||
      value === PdfPatternPaintTypes.Uncolored;
    return valid ? some(value) : none;
  },

  /**
   * @param value - TilingType の整数
   * @returns 1・2・3以外は None
   */
  tilingType(value: number): Option<PdfPatternTilingType> {
    const valid =
      value === PdfPatternTilingTypes.ConstantSpacing ||
      value === PdfPatternTilingTypes.NoDistortion ||
      value === PdfPatternTilingTypes.Faster;
    return valid ? some(value) : none;
  },

  /**
   * 未解釈のオブジェクトを警告とともに保持する。
   * @param object - 不正または未対応の定義
   * @param code - 不正と未対応の区別
   * @returns 元のオブジェクトを保持した Unknown
   */
  unresolved(
    object: PdfObject,
    code: "PATTERN_INVALID" | "PATTERN_UNSUPPORTED",
  ): PdfPattern {
    return {
      patternType: "Unknown",
      object,
      warnings: [
        { code, message: "Invalid or unsupported pattern definition" },
      ],
    };
  },
} as const;
