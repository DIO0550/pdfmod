import {
  type PdfResourceCategory,
  PdfResources,
} from "../../document/resources/index";
import { PdfPattern } from "../../document/resources/pattern/index";
import { PdfShading } from "../../document/resources/shading/index";
import { PdfXObject } from "../../document/resources/xobject/index";
import type { PdfError, PdfWarning } from "../../pdf/errors/index";
import type {
  PdfDictionary,
  PdfObject,
  ResolveRef,
} from "../../pdf/types/index";
import { none, type Option, some } from "../../utils/option/index";
import { flatMap, map, ok, type Result } from "../../utils/result/index";
import {
  type ColorSpaceDefinition,
  ColorSpaceResources,
} from "../color-space-resources/index";
import { type ExtGState, ExtGStateResources } from "../ext-gstate/index";
import { PaintResources } from "../paint-resources/index";

type ResourceLookup<T> = (name: string) => Result<Option<T>, PdfError>;

/** ページまたはフォームの名前を同期実行中に引く、読み取り専用のリソーススコープ。 */
export type ContentStreamResources = {
  readonly getFont: ResourceLookup<PdfDictionary>;
  readonly getXObject: ResourceLookup<PdfXObject>;
  readonly getExtGState: ResourceLookup<ExtGState>;
  readonly getColorSpace: ResourceLookup<ColorSpaceDefinition>;
  readonly getPattern: ResourceLookup<PdfPattern>;
  readonly getShading: ResourceLookup<PdfShading>;
  readonly getProperties: ResourceLookup<PdfDictionary>;
};

function readDictionary(
  object: PdfObject,
): Result<Option<PdfDictionary>, PdfError> {
  return ok(object.type === "dictionary" ? some(object) : none);
}

function lookup<T>(
  category: Result<ReadonlyMap<string, Result<Option<T>, PdfError>>, PdfError>,
): ResourceLookup<T> {
  return (name) =>
    flatMap(category, (entries) => entries.get(name) ?? ok(none));
}

export const ContentStreamResources = {
  /**
   * 同期実行の前に PDF のリソースを準備する。各 getter はスラッシュを除いた名前を受け取る。
   * 名前の不在は None。カテゴリまたは参照先のエラーは該当する getter から返す。
   */
  async fromResources(
    resources: PdfResources,
    resolveRef: ResolveRef,
  ): Promise<ContentStreamResources> {
    const fonts = await PdfResources.readCategory(
      resources,
      { name: "Font", read: readDictionary },
      resolveRef,
    );
    const xObjects = await PdfResources.readCategory(
      resources,
      { name: "XObject", read: PdfXObject.fromObject },
      resolveRef,
    );
    const states = await ExtGStateResources.fromResources(
      resources,
      resolveRef,
    );
    const colorSpaces = await ColorSpaceResources.fromResources(
      resources,
      resolveRef,
    );
    const patterns = await PaintResources.readCategory(
      resources,
      { name: "Pattern", read: PdfPattern.fromObject },
      resolveRef,
    );
    const shadings = await PaintResources.readCategory(
      resources,
      { name: "Shading", read: PdfShading.fromObject },
      resolveRef,
    );
    const properties = await PdfResources.readCategory(
      resources,
      { name: "Properties", read: readDictionary },
      resolveRef,
    );

    return {
      getFont: lookup(fonts),
      getXObject: lookup(xObjects),
      getExtGState: lookup(map(states, ({ states }) => states)),
      getColorSpace: (name) =>
        flatMap(colorSpaces, ({ spaces }) => {
          const space = spaces.get(name);
          return space === undefined
            ? ok<Option<ColorSpaceDefinition>>(none)
            : map(space, some);
        }),
      getPattern: lookup(patterns),
      getShading: lookup(shadings),
      getProperties: lookup(properties),
    };
  },

  /** リソースの参照エラーを、命令の位置に付ける警告へ変換する。 */
  warning(
    resource: { readonly category: PdfResourceCategory; readonly name: string },
    error: PdfError,
  ): PdfWarning {
    return {
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Could not resolve /${resource.category} /${resource.name}: ${error.code}: ${error.message}`,
    };
  },
} as const;
