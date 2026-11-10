import type { PdfError } from "../../../pdf/errors/index";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import {
  type PdfArray,
  type PdfDictionary,
  type PdfName,
  PdfObject,
  type PdfStream,
  type PdfValue,
  ResolveRef,
} from "../../../pdf/types/index";
import {
  fromNullable,
  none,
  type Option,
  some,
} from "../../../utils/option/index";
import { ok, type Result } from "../../../utils/result/index";
import type { ValueOf } from "../../../utils/types/utility-type";
import { CoordinateCounts, ResourceParameters } from "../parameters/index";

/** ISO 32000 §8.7.4 のシェーディング種別。 */
export const PdfShadingTypes = {
  Function: 1,
  Axial: 2,
  Radial: 3,
  FreeForm: 4,
  Lattice: 5,
  Coons: 6,
  Tensor: 7,
} as const;

export type PdfShadingType = ValueOf<typeof PdfShadingTypes>;

type ShadingParameters = {
  readonly dictionary: PdfDictionary;
  readonly colorSpace: PdfName | PdfArray;
  readonly background: Option<readonly number[]>;
  readonly bbox: Option<readonly [number, number, number, number]>;
  readonly function: Option<PdfValue>;
  readonly warnings: readonly PdfWarning[];
};

/** 種別と共通属性。メッシュは未復号ストリームを必ず保持する。 */
export type PdfShading =
  | (ShadingParameters & {
      readonly shadingType:
        | typeof PdfShadingTypes.Function
        | typeof PdfShadingTypes.Axial
        | typeof PdfShadingTypes.Radial;
    })
  | (ShadingParameters & {
      readonly shadingType:
        | typeof PdfShadingTypes.FreeForm
        | typeof PdfShadingTypes.Lattice
        | typeof PdfShadingTypes.Coons
        | typeof PdfShadingTypes.Tensor;
      readonly stream: PdfStream;
    })
  | {
      readonly shadingType: "Unknown";
      readonly object: PdfObject;
      readonly warnings: readonly PdfWarning[];
    };

export const PdfShading = {
  /**
   * シェーディングの種別と属性を読む。Function は評価・参照解決しない。
   * @param object - 名前またはパターンから取得したオブジェクト
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 不正・未知の定義は警告付き Unknown、参照エラーは Err
   */
  async fromObject(
    object: PdfObject,
    resolveRef: ResolveRef,
  ): Promise<Result<PdfShading, PdfError>> {
    const dictionary = object.type === "stream" ? object.dictionary : object;
    if (dictionary.type !== "dictionary") {
      return ok(PdfShading.unresolved(object, "SHADING_INVALID"));
    }

    const type = await ResolveRef.object(
      dictionary.entries.get("ShadingType"),
      resolveRef,
    );
    if (!type.ok) {
      return type;
    }

    const code =
      type.value.some && type.value.value.type === "integer"
        ? type.value.value.value
        : 0;
    const shadingType = PdfShading.typeFromNumber(code);
    if (!shadingType.some) {
      return ok(PdfShading.unresolved(object, "SHADING_UNSUPPORTED"));
    }

    const fields = await ResourceParameters.resolve(
      dictionary,
      ["ColorSpace", "Background", "BBox"],
      resolveRef,
    );
    if (!fields.ok) {
      return fields;
    }

    const colorSpace = PdfObject.asNameOrArray(fields.value.get("ColorSpace"));
    const background = await ResourceParameters.numbers(
      fields.value.get("Background"),
      resolveRef,
    );
    if (!background.ok) {
      return background;
    }

    const bbox = await ResourceParameters.coordinates(
      fields.value.get("BBox"),
      CoordinateCounts.Rectangle,
      resolveRef,
    );
    if (!bbox.ok) {
      return bbox;
    }

    const invalidBackground =
      fields.value.has("Background") && !background.value.some;
    const invalidBBox = fields.value.has("BBox") && !bbox.value.some;
    const invalid = !colorSpace.some || invalidBackground || invalidBBox;
    if (invalid) {
      return ok(PdfShading.unresolved(object, "SHADING_INVALID"));
    }

    const parameters: ShadingParameters = {
      dictionary,
      colorSpace: colorSpace.value,
      background: background.value,
      bbox: bbox.value,
      function: fromNullable(dictionary.entries.get("Function")),
      warnings: [],
    };
    switch (shadingType.value) {
      case PdfShadingTypes.Function:
      case PdfShadingTypes.Axial:
      case PdfShadingTypes.Radial:
        return ok({ ...parameters, shadingType: shadingType.value });
      case PdfShadingTypes.FreeForm:
      case PdfShadingTypes.Lattice:
      case PdfShadingTypes.Coons:
      case PdfShadingTypes.Tensor:
        return ok(
          object.type === "stream"
            ? { ...parameters, shadingType: shadingType.value, stream: object }
            : PdfShading.unresolved(object, "SHADING_INVALID"),
        );
    }
  },

  /**
   * 仕様の種別番号へ絞り込む。
   * @param value - /ShadingType の整数
   * @returns 1〜7なら種別、それ以外は None
   */
  typeFromNumber(value: number): Option<PdfShadingType> {
    switch (value) {
      case PdfShadingTypes.Function:
      case PdfShadingTypes.Axial:
      case PdfShadingTypes.Radial:
      case PdfShadingTypes.FreeForm:
      case PdfShadingTypes.Lattice:
      case PdfShadingTypes.Coons:
      case PdfShadingTypes.Tensor:
        return some(value);
      default:
        return none;
    }
  },

  /**
   * 未解釈のオブジェクトを警告とともに保持する。
   * @param object - 不正または未対応の定義
   * @param code - 不正と未対応の区別
   * @returns 元のオブジェクトを保持した Unknown
   */
  unresolved(
    object: PdfObject,
    code: "SHADING_INVALID" | "SHADING_UNSUPPORTED",
  ): PdfShading {
    return {
      shadingType: "Unknown",
      object,
      warnings: [
        { code, message: "Invalid or unsupported shading definition" },
      ],
    };
  },
} as const;
