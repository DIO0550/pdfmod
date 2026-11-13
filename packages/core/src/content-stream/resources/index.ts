import {
  type PdfResourceCategory,
  PdfResources,
} from "../../document/resources/index";
import { PdfPattern } from "../../document/resources/pattern/index";
import { PdfShading } from "../../document/resources/shading/index";
import {
  type PdfFormXObject,
  PdfXObject,
  PdfXObjectSubtype,
} from "../../document/resources/xobject/index";
import type { PdfError, PdfWarning } from "../../pdf/errors/index";
import {
  IndirectRef,
  type PdfDictionary,
  type PdfObject,
  type PdfStream,
  type ResolveRef,
} from "../../pdf/types/index";
import { none, type Option, some } from "../../utils/option/index";
import { err, flatMap, map, ok, type Result } from "../../utils/result/index";
import {
  type ColorSpaceDefinition,
  ColorSpaceResources,
} from "../color-space-resources/index";
import { type ExtGState, ExtGStateResources } from "../ext-gstate/index";
import { PaintResources } from "../paint-resources/index";
import { FormXObjectContent } from "./form-xobject-content/index";

type ResourceLookup<T> = (name: string) => Result<Option<T>, PdfError>;

export type PreparedFormXObject = FormXObjectContent & {
  /** /Resources を省略した Form は呼び出し元のスコープを使う。 */
  readonly resources: Option<ContentStreamResources>;
};

type PreparedResourceScope = {
  readonly scope: ContentStreamResources;
  readonly forms: readonly PdfFormXObject[];
};

/** ページまたはフォームの名前を同期実行中に引く、読み取り専用のリソーススコープ。 */
export type ContentStreamResources = {
  readonly getFont: ResourceLookup<PdfDictionary>;
  readonly getXObject: ResourceLookup<PdfXObject>;
  readonly getExtGState: ResourceLookup<ExtGState>;
  readonly getColorSpace: ResourceLookup<ColorSpaceDefinition>;
  readonly getPattern: ResourceLookup<PdfPattern>;
  readonly getShading: ResourceLookup<PdfShading>;
  readonly getProperties: ResourceLookup<PdfDictionary>;
  /** fromResources が準備した Form の実行入力を引く。 */
  readonly getFormContent?: (
    form: PdfFormXObject,
  ) => Result<PreparedFormXObject, PdfError>;
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

/**
 * 文書内のリソース辞書と Form を準備する。Form が辞書を共有しても各スコープは一度だけ読む。
 */
class ResourcePreparation {
  readonly #resolveRef: ResolveRef;
  readonly #scopes = new Map<PdfDictionary, ContentStreamResources>();
  readonly #xObjects = new Map<PdfStream, Result<PdfXObject, PdfError>>();
  readonly #forms = new Map<
    PdfFormXObject,
    Result<PreparedFormXObject, PdfError>
  >();

  constructor(resolveRef: ResolveRef) {
    const objects = new Map<string, Promise<Result<PdfObject, PdfError>>>();
    this.#resolveRef = (ref) => {
      const key = IndirectRef.key(ref);
      const cached = objects.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const object = resolveRef(ref);
      objects.set(key, object);
      return object;
    };
  }

  async prepare(resources: PdfResources): Promise<ContentStreamResources> {
    const root = await this.readScope(resources);
    const queue = [...root.forms];

    // スコープを登録してから、その配下の Form をたどる。
    for (const form of queue) {
      const content = await FormXObjectContent.fromForm(form, this.#resolveRef);
      if (!content.ok) {
        this.#forms.set(form, content);
        continue;
      }

      if (!form.resources.some) {
        this.#forms.set(form, ok({ ...content.value, resources: none }));
        continue;
      }

      const { scope, forms } = await this.readScope(
        PdfResources.from(form.resources.value),
      );
      this.#forms.set(form, ok({ ...content.value, resources: some(scope) }));
      for (const child of forms) {
        queue.push(child);
      }
    }

    return root.scope;
  }

  private async readScope(
    resources: PdfResources,
  ): Promise<PreparedResourceScope> {
    const existing = this.#scopes.get(resources.dictionary);
    if (existing !== undefined) {
      return { scope: existing, forms: [] };
    }

    const resolveRef = this.#resolveRef;
    const fonts = await PdfResources.readCategory(
      resources,
      { name: "Font", read: readDictionary },
      resolveRef,
    );
    const forms: PdfFormXObject[] = [];
    const xObjects = await PdfResources.readCategory(
      resources,
      {
        name: "XObject",
        read: async (object, resolveRef) => {
          if (object.type !== "stream") {
            return ok(none);
          }

          const cached = this.#xObjects.get(object);
          if (cached !== undefined) {
            return map(cached, some);
          }

          const result = await PdfXObject.fromStream(object, resolveRef);
          this.#xObjects.set(object, result);
          const form =
            result.ok && result.value.subtype === PdfXObjectSubtype.Form;
          if (form) {
            forms.push(result.value);
          }

          return map(result, some);
        },
      },
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

    const preparedForms = this.#forms;
    const scope: ContentStreamResources = {
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
      getFormContent: (form) =>
        preparedForms.get(form) ??
        err({
          code: "PDF_TYPE_INVALID",
          message: "Form content was not prepared",
        }),
    };
    this.#scopes.set(resources.dictionary, scope);

    return { scope, forms };
  }
}

export const ContentStreamResources = {
  /**
   * 同期実行の前にリソース辞書と Form の命令列を準備する。
   * @param resources - ページまたは Form のリソース辞書
   * @param resolveRef - 同じ文書の間接参照解決関数
   * @returns 名前を引くスコープ。参照・復号エラーは該当する getter が返す
   */
  async fromResources(
    resources: PdfResources,
    resolveRef: ResolveRef,
  ): Promise<ContentStreamResources> {
    return new ResourcePreparation(resolveRef).prepare(resources);
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
