import { PdfResources } from "../../document/resources/index";
import type { PdfError } from "../../pdf/errors/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  PdfArray,
  PdfDictionary,
  PdfObject,
  PdfValue,
} from "../../pdf/types/index";
import { ResolveRef } from "../../pdf/types/index";
import { none, some } from "../../utils/option/index";
import { ok, type Result } from "../../utils/result/index";
import { ColorSpace } from "../graphics-state/color-space/index";

const MAX_COLOR_SPACE_DEPTH = 32;

/** 名前に対応する色空間と、選択時に報告する警告。 */
export type ColorSpaceDefinition = {
  readonly colorSpace: ColorSpace;
  readonly warnings: readonly PdfWarning[];
};

type ColorSpaceScope = {
  readonly dictionary: PdfDictionary;
  readonly ancestors: ReadonlySet<PdfObject>;
};

/** 現在のページ・フォームで使用する色空間の解決結果。 */
export type ColorSpaceResources = {
  readonly spaces: ReadonlyMap<string, Result<ColorSpaceDefinition, PdfError>>;
};

export const ColorSpaceResources = {
  /** @returns 色空間リソースのないスコープ */
  empty(): ColorSpaceResources {
    return { spaces: new Map() };
  },

  /**
   * 同期実行前に /ColorSpace のカテゴリと定義を解決する。
   * @param resources - 現在のリソーススコープ
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns カテゴリのエラーは Err。各定義のエラーは選択時まで保持する
   */
  async fromResources(
    resources: PdfResources,
    resolveRef: ResolveRef,
  ): Promise<Result<ColorSpaceResources, PdfError>> {
    const category = await PdfResources.getCategory(
      resources,
      "ColorSpace",
      resolveRef,
    );
    if (!category.ok) {
      return category;
    }

    if (!category.value.some) {
      return ok(ColorSpaceResources.empty());
    }

    const dictionary = category.value.value;
    const spaces = new Map<string, Result<ColorSpaceDefinition, PdfError>>();
    for (const [name, value] of dictionary.entries) {
      spaces.set(
        name,
        await ColorSpaceDefinition.read(value, resolveRef, {
          dictionary,
          ancestors: new Set(),
        }),
      );
    }

    return ok({ spaces });
  },
} as const;

export const ColorSpaceDefinition = {
  /**
   * 直接値・間接参照から色空間の族と成分数を読む。
   * @param value - 色空間定義
   * @param resolveRef - 同じ文書の参照解決関数
   * @param scope - ローカル名の辞書と現在の参照経路
   * @returns 未知・不正・循環は警告付きの未知色空間。参照解決の失敗は Err
   */
  async read(
    value: PdfValue | undefined,
    resolveRef: ResolveRef,
    scope: ColorSpaceScope,
  ): Promise<Result<ColorSpaceDefinition, PdfError>> {
    const resolved = await ResolveRef.object(value, resolveRef);
    if (!resolved.ok) {
      return resolved;
    }

    if (!resolved.value.some) {
      return ok(
        ColorSpaceDefinition.unresolved("missing", "COLOR_SPACE_INVALID"),
      );
    }

    const object = resolved.value.value;
    const recursive =
      scope.ancestors.has(object) ||
      scope.ancestors.size >= MAX_COLOR_SPACE_DEPTH;
    if (recursive) {
      return ok(
        ColorSpaceDefinition.unresolved("cyclic", "COLOR_SPACE_INVALID"),
      );
    }

    const next = { ...scope, ancestors: new Set([...scope.ancestors, object]) };
    if (object.type === "name") {
      const builtin = ColorSpace.fromName(object.value);
      if (builtin.some) {
        return ok({ colorSpace: builtin.value, warnings: [] });
      }

      const local = scope.dictionary.entries.get(object.value);
      return local
        ? ColorSpaceDefinition.read(local, resolveRef, next)
        : ok(
            ColorSpaceDefinition.unresolved(
              object.value,
              "COLOR_SPACE_NOT_FOUND",
            ),
          );
    }

    if (object.type !== "array") {
      return ok(
        ColorSpaceDefinition.unresolved(object.type, "COLOR_SPACE_INVALID"),
      );
    }

    return ColorSpaceDefinition.fromArray(object, resolveRef, next);
  },

  /**
   * 色空間配列の族ごとの成分数に必要な値を解決する。
   * @param definition - PDFの色空間配列
   * @param resolveRef - 同じ文書の参照解決関数
   * @param scope - 現在の解決経路
   * @returns 族と必要な属性。不正な属性は警告、参照解決の失敗は Err
   */
  async fromArray(
    definition: PdfArray,
    resolveRef: ResolveRef,
    scope: ColorSpaceScope,
  ): Promise<Result<ColorSpaceDefinition, PdfError>> {
    const first = await ResolveRef.object(definition.elements[0], resolveRef);
    if (!first.ok) {
      return first;
    }

    const namedFamily = first.value.some && first.value.value.type === "name";
    if (!namedFamily) {
      return ok(
        ColorSpaceDefinition.unresolved("invalid", "COLOR_SPACE_INVALID"),
      );
    }

    const family = first.value.value.value;
    const invalid = ColorSpaceDefinition.unresolved(
      family,
      "COLOR_SPACE_INVALID",
    );
    switch (family) {
      case "DeviceGray":
      case "DeviceRGB":
      case "DeviceCMYK":
        return ColorSpaceDefinition.read(
          definition.elements[0],
          resolveRef,
          scope,
        );
      case "CalGray":
      case "CalRGB":
      case "Lab": {
        const parameters = await ResolveRef.object(
          definition.elements[1],
          resolveRef,
        );
        if (!parameters.ok) {
          return parameters;
        }

        const valid =
          parameters.value.some && parameters.value.value.type === "dictionary";
        return ok(
          valid
            ? { colorSpace: { family, definition }, warnings: [] }
            : invalid,
        );
      }
      case "Separation":
        return ok({ colorSpace: { family, definition }, warnings: [] });
      case "ICCBased": {
        const profile = await ResolveRef.object(
          definition.elements[1],
          resolveRef,
        );
        if (!profile.ok) {
          return profile;
        }

        const stream =
          profile.value.some && profile.value.value.type === "stream"
            ? profile.value.value
            : undefined;
        if (!stream) {
          return ok(invalid);
        }

        const count = await ResolveRef.object(
          stream.dictionary.entries.get("N"),
          resolveRef,
        );
        if (!count.ok) {
          return count;
        }

        const n =
          count.value.some && count.value.value.type === "integer"
            ? count.value.value.value
            : 0;
        const components = ColorSpace.iccComponentCount(n);
        return ok(
          components.some
            ? {
                colorSpace: {
                  family,
                  profile: stream,
                  components: components.value,
                },
                warnings: [],
              }
            : invalid,
        );
      }
      case "Indexed":
      case "Pattern": {
        if (definition.elements.length === 1 && family === "Pattern") {
          return ok({ colorSpace: { family, base: none }, warnings: [] });
        }

        const base = await ColorSpaceDefinition.read(
          definition.elements[1],
          resolveRef,
          scope,
        );
        if (!base.ok) {
          return base;
        }

        const colorSpace: ColorSpace =
          family === "Indexed"
            ? { family, base: base.value.colorSpace, definition }
            : { family, base: some(base.value.colorSpace) };
        return ok({ colorSpace, warnings: base.value.warnings });
      }
      case "DeviceN": {
        const names = await ResolveRef.object(
          definition.elements[1],
          resolveRef,
        );
        if (!names.ok) {
          return names;
        }

        if (!names.value.some || names.value.value.type !== "array") {
          return ok(invalid);
        }

        const values: string[] = [];
        for (const entry of names.value.value.elements) {
          const name = await ResolveRef.object(entry, resolveRef);
          if (!name.ok) {
            return name;
          }

          if (!name.value.some || name.value.value.type !== "name") {
            return ok(invalid);
          }

          values.push(name.value.value.value);
        }

        return ok(
          values.length > 0
            ? {
                colorSpace: { family, names: values, definition },
                warnings: [],
              }
            : invalid,
        );
      }
      default:
        return ok(ColorSpaceDefinition.unresolved(family));
    }
  },

  /**
   * 成分数を確定できない定義を警告とともに保持する。
   * @param name - 未知の族または不正な定義の識別名
   * @param code - 未対応・不正・名前不在の区別
   * @returns 成分数不明の色空間と警告
   */
  unresolved(
    name: string,
    code:
      | "COLOR_SPACE_UNSUPPORTED"
      | "COLOR_SPACE_NOT_FOUND"
      | "COLOR_SPACE_INVALID" = "COLOR_SPACE_UNSUPPORTED",
  ): ColorSpaceDefinition {
    return {
      colorSpace: { family: "Unknown", name },
      warnings: [{ code, message: `Unresolved color space: /${name}` }],
    };
  },
} as const;
