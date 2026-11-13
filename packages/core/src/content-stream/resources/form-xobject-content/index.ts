import type { PdfRectangle } from "../../../document/page-tree/resolved-page/index";
import { ResourceParameters } from "../../../document/resources/parameters/index";
import type { PdfFormXObject } from "../../../document/resources/xobject/index";
import type { PdfError } from "../../../pdf/errors/index";
import { PdfFilter } from "../../../pdf/filter/index";
import {
  type PdfDictionary,
  type PdfObject,
  type PdfStream,
  ResolveRef,
} from "../../../pdf/types/index";
import {
  fromNullable,
  none,
  type Option,
  some,
} from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import { Predictor } from "../../../xref/stream/predictor/index";

/** 有効な境界と、同期インタプリタへ渡せる復号済み命令列。 */
export type FormXObjectContent = {
  readonly bbox: PdfRectangle;
  readonly data: Uint8Array;
};

const FILTER_KEYS = ["Filter", "DecodeParms"] as const;

export const FormXObjectContent = {
  /**
   * Form の実行に必要な境界・リソース指定を検証し、命令列を復号する。
   * @param form - /XObject から解決した Form
   * @param resolveRef - フィルタ属性の間接参照解決関数
   * @returns 実行可能な境界と命令列。辞書や復号に問題がある場合は Err
   */
  async fromForm(
    form: PdfFormXObject,
    resolveRef: ResolveRef,
  ): Promise<Result<FormXObjectContent, PdfError>> {
    if (!form.bbox.some) {
      return err({
        code: "PDF_TYPE_INVALID",
        message: "Form /BBox must contain four finite numbers",
      });
    }

    const resources = form.stream.dictionary.entries.get("Resources");
    const invalidResources =
      resources !== undefined &&
      resources.type !== "null" &&
      !form.resources.some;
    if (invalidResources) {
      return err({
        code: "PDF_TYPE_INVALID",
        message: "Form /Resources must resolve to a dictionary",
      });
    }

    const data = await decodeFormStream(form.stream, resolveRef);
    if (!data.ok) {
      return data;
    }

    return ok({ bbox: form.bbox.value, data: data.value });
  },
} as const;

/**
 * @param stream - 元の Form ストリーム
 * @param resolveRef - フィルタ属性の参照解決関数
 * @returns 復号済みの命令列、フィルタ指定や展開に問題があれば Err
 */
async function decodeFormStream(
  stream: PdfStream,
  resolveRef: ResolveRef,
): Promise<Result<Uint8Array, PdfError>> {
  const rawFilter = stream.dictionary.entries.get("Filter");
  const unfiltered = rawFilter === undefined || rawFilter.type === "null";
  if (unfiltered) {
    return ok(stream.data);
  }

  const attributes = await ResourceParameters.resolve(
    stream.dictionary,
    FILTER_KEYS,
    resolveRef,
  );
  if (!attributes.ok) {
    return attributes;
  }

  const filter = await resolveFilterValue(
    attributes.value.get("Filter"),
    resolveRef,
  );
  if (!filter.ok) {
    return filter;
  }

  const hasName = filter.value.some && filter.value.value.type === "name";
  if (!hasName) {
    return err({
      code: "PDF_FILTER_UNSUPPORTED",
      message: "Form /Filter must specify one filter name",
    });
  }

  const dictionary = await decodeParameters(
    attributes.value.get("DecodeParms"),
    resolveRef,
  );
  if (!dictionary.ok) {
    return dictionary;
  }

  const decodeParms = dictionary.value.some
    ? dictionary.value.value.entries
    : undefined;
  const predictor = Predictor.parseParams(decodeParms);
  if (!predictor.ok) {
    return err({ ...predictor.error, code: "PDF_FILTER_UNSUPPORTED" });
  }

  const name = filter.value.value.value;
  const data = await PdfFilter.decode(stream.data, name, {
    decodeParms,
  });
  if (!data.ok) {
    return data;
  }

  const content = Predictor.apply(data.value, predictor.value);
  return content.ok
    ? content
    : err({ ...content.error, code: "PDF_FILTER_UNSUPPORTED" });
}

/**
 * 単一フィルタの配列を展開し、要素が間接参照なら解決する。
 * @param value - 解決済みの /Filter または /DecodeParms
 * @param resolveRef - 配列要素の参照解決関数
 * @returns 配列要素または単独値。参照解決の失敗は Err
 */
async function resolveFilterValue(
  value: PdfObject | undefined,
  resolveRef: ResolveRef,
): Promise<Result<Option<PdfObject>, PdfError>> {
  const single = value?.type === "array" && value.elements.length === 1;
  if (!single) {
    return ok(fromNullable(value));
  }

  return ResolveRef.object(value.elements[0], resolveRef);
}

/**
 * @param parms - 解決済みの /DecodeParms
 * @param resolveRef - 配列内の間接参照解決関数
 * @returns フィルタのパラメータ辞書。省略時は None、型不正は Err
 */
async function decodeParameters(
  parms: PdfObject | undefined,
  resolveRef: ResolveRef,
): Promise<Result<Option<PdfDictionary>, PdfError>> {
  const resolved = await resolveFilterValue(parms, resolveRef);
  if (!resolved.ok) {
    return resolved;
  }

  const value = resolved.value;
  const omitted = !value.some || value.value.type === "null";
  if (omitted) {
    return ok(none);
  }

  if (value.value.type === "dictionary") {
    return ok(some(value.value));
  }

  return err({
    code: "PDF_FILTER_UNSUPPORTED",
    message: "Form /DecodeParms must be a dictionary or a single-element array",
  });
}
