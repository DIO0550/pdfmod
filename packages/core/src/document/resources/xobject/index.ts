import { Matrix } from "../../../content-stream/graphics-state/matrix/index";
import type { PdfError } from "../../../pdf/errors/index";
import {
  type PdfArray,
  type PdfDictionary,
  type PdfName,
  PdfObject,
  type PdfStream,
  ResolveRef,
} from "../../../pdf/types/index";
import type { ValueOf } from "../../../utils/index";
import {
  fromNullable,
  map as mapOption,
  none,
  type Option,
  some,
} from "../../../utils/option/index";
import { ok, type Result } from "../../../utils/result/index";
import { PdfRectangle } from "../../page-tree/resolved-page/index";

const ComponentDepth = {
  One: 1,
  Two: 2,
  Four: 4,
  Eight: 8,
  Sixteen: 16,
} as const;
type ComponentDepth = ValueOf<typeof ComponentDepth>;
const ComponentDepths = Object.values(ComponentDepth);

/** /Subtype の判別値。Unknown は欠落・未知の種別を表す。 */
export const PdfXObjectSubtype = {
  Image: "Image",
  Form: "Form",
  PS: "PS",
  Unknown: "Unknown",
} as const;

export type PdfXObjectSubtype = ValueOf<typeof PdfXObjectSubtype>;

/** ラスタ画像とその未復号ストリーム。 */
export type PdfImageXObject = {
  readonly stream: PdfStream;
  readonly subtype: typeof PdfXObjectSubtype.Image;
  readonly width: Option<number>;
  readonly height: Option<number>;
  readonly bitsPerComponent: Option<ComponentDepth>;
  readonly colorSpace: Option<PdfName | PdfArray>;
  readonly filter: Option<PdfName | PdfArray>;
  readonly sMask: Option<PdfStream>;
  readonly mask: Option<PdfStream | PdfArray>;
  readonly imageMask: boolean;
};

/** 再利用可能な描画命令とフォーム座標系。 */
export type PdfFormXObject = {
  readonly stream: PdfStream;
  readonly subtype: typeof PdfXObjectSubtype.Form;
  readonly bbox: Option<PdfRectangle>;
  readonly matrix: Matrix;
  readonly resources: Option<PdfDictionary>;
};

/** 非推奨の PostScript XObject。 */
export type PdfPostScriptXObject = {
  readonly subtype: typeof PdfXObjectSubtype.PS;
  readonly stream: PdfStream;
};

/** 未知の種別名と元のストリーム。種別名が欠落している場合は None。 */
export type PdfUnknownXObject = {
  readonly subtype: typeof PdfXObjectSubtype.Unknown;
  readonly stream: PdfStream;
  readonly name: Option<string>;
};

/** 現在のリソース辞書から解決した XObject。 */
export type PdfXObject =
  | PdfImageXObject
  | PdfFormXObject
  | PdfPostScriptXObject
  | PdfUnknownXObject;

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

const PdfImageXObject = {
  /** @param stream - 画像の元ストリーム
   * @param fields - 解決済み画像属性
   * @returns ストリーム辞書の画像属性とステンシル指定（省略時は false）
   */
  fromFields(
    stream: PdfStream,
    fields: ReadonlyMap<string, PdfObject>,
  ): PdfImageXObject {
    const bits = PdfObject.asPositiveInteger(fields.get("BitsPerComponent"));
    const depth = bits.some
      ? ComponentDepths.find((n) => n === bits.value)
      : undefined;

    const sMask = fields.get("SMask");
    const mask = fields.get("Mask");
    const validMask = mask?.type === "stream" || mask?.type === "array";

    const stencil = fields.get("ImageMask");
    return {
      subtype: PdfXObjectSubtype.Image,
      stream,
      width: PdfObject.asPositiveInteger(fields.get("Width")),
      height: PdfObject.asPositiveInteger(fields.get("Height")),
      bitsPerComponent: fromNullable(depth),
      colorSpace: PdfObject.asNameOrArray(fields.get("ColorSpace")),
      filter: PdfObject.asNameOrArray(fields.get("Filter")),
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

const PdfFormXObject = {
  /**
   * @param stream - フォームの元ストリーム
   * @param fields - 解決済みフォーム属性
   * @param resolveRef - 座標の間接参照解決関数
   * @returns 正規化した境界、変換行列、フォーム固有のリソース辞書。参照エラーは Err
   */
  async fromFields(
    stream: PdfStream,
    fields: ReadonlyMap<string, PdfObject>,
    resolveRef: ResolveRef,
  ): Promise<Result<PdfFormXObject, PdfError>> {
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
      subtype: PdfXObjectSubtype.Form,
      stream,
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
      return ok({ subtype: PdfXObjectSubtype.Unknown, name: none, stream });
    }

    const name = value.value.value;
    if (name === PdfXObjectSubtype.PS) {
      return ok({ subtype: PdfXObjectSubtype.PS, stream });
    }

    const supported =
      name === PdfXObjectSubtype.Image || name === PdfXObjectSubtype.Form;
    if (!supported) {
      return ok({
        subtype: PdfXObjectSubtype.Unknown,
        name: some(name),
        stream,
      });
    }

    const keys = name === PdfXObjectSubtype.Image ? ImageKeys : FormKeys;
    const fields = await resolveFields(stream.dictionary, keys, resolveRef);
    if (!fields.ok) {
      return fields;
    }

    if (name === PdfXObjectSubtype.Image) {
      return ok(PdfImageXObject.fromFields(stream, fields.value));
    }

    return PdfFormXObject.fromFields(stream, fields.value, resolveRef);
  },
} as const;
