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
import { map, ok, type Result } from "../../../utils/result/index";
import { PdfRectangle } from "../../page-tree/resolved-page/index";
import { CoordinateCounts, ResourceParameters } from "../parameters/index";

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
    const bbox = await ResourceParameters.coordinates(
      fields.get("BBox"),
      CoordinateCounts.Rectangle,
      resolveRef,
    );
    if (!bbox.ok) {
      return bbox;
    }

    const matrix = await ResourceParameters.coordinates(
      fields.get("Matrix"),
      CoordinateCounts.Matrix,
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
  /** ストリームを XObject として読み、それ以外のオブジェクトは None を返す。 */
  async fromObject(
    object: PdfObject,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfXObject>, PdfError>> {
    if (object.type !== "stream") {
      return ok(none);
    }

    return map(await PdfXObject.fromStream(object, resolveRef), some);
  },

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
    const fields = await ResourceParameters.resolve(
      stream.dictionary,
      keys,
      resolveRef,
    );
    if (!fields.ok) {
      return fields;
    }

    if (name === PdfXObjectSubtype.Image) {
      return ok(PdfImageXObject.fromFields(stream, fields.value));
    }

    return PdfFormXObject.fromFields(stream, fields.value, resolveRef);
  },
} as const;
