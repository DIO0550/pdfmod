import { Matrix } from "../../../content-stream/graphics-state/matrix/index";
import type { PdfError } from "../../../pdf/errors/index";
import {
  type PdfArray,
  type PdfDictionary,
  type PdfName,
  type PdfObject,
  type PdfStream,
  ResolveRef,
} from "../../../pdf/types/index";
import {
  fromNullable,
  map as mapOption,
  none,
  type Option,
  some,
} from "../../../utils/option/index";
import { map, ok, type Result } from "../../../utils/result/index";
import { PdfRectangle } from "../../page-tree/resolved-page/index";

const ComponentDepth = {
  One: 1,
  Two: 2,
  Four: 4,
  Eight: 8,
  Sixteen: 16,
} as const;
type ComponentDepth = (typeof ComponentDepth)[keyof typeof ComponentDepth];
const ComponentDepths = Object.values(ComponentDepth);

type Image = {
  readonly subtype: "Image";
  readonly width: Option<number>;
  readonly height: Option<number>;
  readonly bitsPerComponent: Option<ComponentDepth>;
  readonly colorSpace: Option<PdfName | PdfArray>;
  readonly filter: Option<PdfName | PdfArray>;
  readonly sMask: Option<PdfStream>;
  readonly mask: Option<PdfStream | PdfArray>;
  readonly imageMask: boolean;
};

type Form = {
  readonly subtype: "Form";
  readonly bbox: Option<PdfRectangle>;
  readonly matrix: Matrix;
  readonly resources: Option<PdfDictionary>;
};

/** 種別に固有の属性と、未復号のストリームを保持する。 */
export type PdfXObject = { readonly stream: PdfStream } & (
  | Image
  | Form
  | { readonly subtype: "PS" }
  | { readonly subtype: "Unknown"; readonly name: Option<string> }
);

const ImageKeys = [
  "Width",
  "Height",
  "BitsPerComponent",
  "ColorSpace",
  "Filter",
  "SMask",
  "Mask",
  "ImageMask",
] as const;
const FormKeys = ["BBox", "Matrix", "Resources"] as const;
const RECTANGLE_SIZE = 4;
const MATRIX_SIZE = 6;

/**
 * 種別が使用する辞書エントリのみを1段解決する。子のリソース辞書は走査しない。
 * @param dictionary - 対象ストリームの辞書
 * @param keys - この種別で使用するPDFのキー
 * @param resolveRef - 同じ文書の間接参照解決関数
 * @returns 存在する属性の対応表。参照先の解析に失敗した場合はそのエラー
 */
async function resolveFields(
  dictionary: PdfDictionary,
  keys: readonly string[],
  resolveRef: ResolveRef,
): Promise<Result<Map<string, PdfObject>, PdfError>> {
  const fields = new Map<string, PdfObject>();
  for (const key of keys) {
    const result = await ResolveRef.object(
      dictionary.entries.get(key),
      resolveRef,
    );

    if (!result.ok) {
      return result;
    }

    if (result.value.some) {
      fields.set(key, result.value.value);
    }
  }
  return ok(fields);
}

/** @param value - 辞書エントリの解決値
 * @returns 正の整数ならその値。それ以外は None
 */
function positiveInteger(value: PdfObject | undefined): Option<number> {
  const valid = value?.type === "integer" && value.value > 0;
  return valid ? some(value.value) : none;
}

/** @param value - 色空間またはフィルタの解決値
 * @returns 名前または配列なら元のPDF値。それ以外は None
 */
function nameOrArray(value: PdfObject | undefined): Option<PdfName | PdfArray> {
  const valid = value?.type === "name" || value?.type === "array";
  return valid ? some(value) : none;
}

const Image = {
  /** @param fields - 解決済み画像属性
   * @returns ストリーム辞書の画像属性とステンシル指定（省略時は false）
   */
  fromFields(fields: ReadonlyMap<string, PdfObject>): Image {
    const bits = positiveInteger(fields.get("BitsPerComponent"));
    const depth = bits.some
      ? ComponentDepths.find((n) => n === bits.value)
      : undefined;

    const sMask = fields.get("SMask");
    const mask = fields.get("Mask");
    const validMask = mask?.type === "stream" || mask?.type === "array";

    const stencil = fields.get("ImageMask");
    return {
      subtype: "Image",
      width: positiveInteger(fields.get("Width")),
      height: positiveInteger(fields.get("Height")),
      bitsPerComponent: fromNullable(depth),
      colorSpace: nameOrArray(fields.get("ColorSpace")),
      filter: nameOrArray(fields.get("Filter")),
      sMask: sMask?.type === "stream" ? some(sMask) : none,
      mask: validMask ? some(mask) : none,
      imageMask: stencil?.type === "boolean" && stencil.value,
    };
  },
} as const;

/**
 * 矩形または行列の各成分を読む。
 * @param value - 辞書から取得した配列
 * @param size - 必要な成分数
 * @param resolveRef - 成分が間接参照だった場合の解決関数
 * @returns 必要な数値が揃えば Some。不在・型不正は None、参照エラーは Err
 */
async function coordinates(
  value: PdfObject | undefined,
  size: number,
  resolveRef: ResolveRef,
): Promise<Result<Option<number[]>, PdfError>> {
  const validSize = value?.type === "array" && value.elements.length === size;
  if (!validSize) {
    return ok(none);
  }

  const numbers: number[] = [];
  for (const element of value.elements) {
    const result = await ResolveRef.object(element, resolveRef);

    if (!result.ok) {
      return result;
    }

    if (!result.value.some) {
      return ok(none);
    }
    const number = result.value.value;
    const numeric = number.type === "integer" || number.type === "real";
    if (!numeric) {
      return ok(none);
    }
    numbers.push(number.value);
  }
  return ok(some(numbers));
}

const Form = {
  /**
   * @param fields - 解決済みフォーム属性
   * @param resolveRef - 座標の間接参照解決関数
   * @returns 正規化した境界、変換行列、フォーム固有のリソース辞書。参照エラーは Err
   */
  async fromFields(
    fields: ReadonlyMap<string, PdfObject>,
    resolveRef: ResolveRef,
  ): Promise<Result<Form, PdfError>> {
    const bbox = await coordinates(
      fields.get("BBox"),
      RECTANGLE_SIZE,
      resolveRef,
    );
    if (!bbox.ok) {
      return bbox;
    }

    const matrix = await coordinates(
      fields.get("Matrix"),
      MATRIX_SIZE,
      resolveRef,
    );
    if (!matrix.ok) {
      return matrix;
    }

    const resources = fields.get("Resources");
    const transform = mapOption(matrix.value, ([a, b, c, d, e, f]) =>
      Matrix.create(a, b, c, d, e, f),
    );
    return ok({
      subtype: "Form",
      bbox: mapOption(bbox.value, ([x1, y1, x2, y2]) =>
        PdfRectangle.normalize([x1, y1, x2, y2]),
      ),
      matrix: transform.some ? transform.value : Matrix.identity(),
      resources: resources?.type === "dictionary" ? some(resources) : none,
    });
  },
} as const;

export const PdfXObject = {
  /**
   * /Subtype から種別と属性を読み、元のストリームを保持する。
   * @param stream - 名前解決で得たストリーム
   * @param resolveRef - 同じ文書の間接参照解決関数
   * @returns 参照エラーなら Err。種別が欠落・未知でもストリームを返す
   */
  async fromStream(
    stream: PdfStream,
    resolveRef: ResolveRef,
  ): Promise<Result<PdfXObject, PdfError>> {
    const subtype = await ResolveRef.object(
      stream.dictionary.entries.get("Subtype"),
      resolveRef,
    );

    if (!subtype.ok) {
      return subtype;
    }

    const value = subtype.value;
    if (!value.some || value.value.type !== "name") {
      return ok({ subtype: "Unknown", name: none, stream });
    }

    const name = value.value.value;
    if (name === "PS") {
      return ok({ subtype: "PS", stream });
    }

    const supported = name === "Image" || name === "Form";
    if (!supported) {
      return ok({ subtype: "Unknown", name: some(name), stream });
    }

    const keys = name === "Image" ? ImageKeys : FormKeys;
    const fields = await resolveFields(stream.dictionary, keys, resolveRef);
    if (!fields.ok) {
      return fields;
    }

    if (name === "Image") {
      return ok({ stream, ...Image.fromFields(fields.value) });
    }

    const form = await Form.fromFields(fields.value, resolveRef);
    return map(form, (attributes) => ({ stream, ...attributes }));
  },
} as const;
