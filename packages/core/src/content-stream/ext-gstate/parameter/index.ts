import type { PdfError } from "../../../pdf/errors/index";
import type {
  PdfArray,
  PdfDictionary,
  PdfValue,
} from "../../../pdf/types/index";
import { PdfObject, ResolveRef } from "../../../pdf/types/index";
import { map, none, type Option, some } from "../../../utils/option/index";
import { ok, type Result } from "../../../utils/result/index";
import { Alpha } from "../../graphics-state/alpha/index";
import { BlendMode, BlendModes } from "../../graphics-state/blend-mode/index";
import { DashPattern } from "../../graphics-state/dash-pattern/index";
import { GraphicsState } from "../../graphics-state/graphics-state/index";
import { LineCap } from "../../graphics-state/line-cap/index";
import { LineJoin } from "../../graphics-state/line-join/index";
import { SoftMask } from "../../graphics-state/soft-mask/index";
import { TextState } from "../../graphics-state/text-state/index";

/** キーと値の対応を保持する、解決済みの拡張グラフィックス状態パラメータ。 */
export type ExtGStateParameter =
  | { readonly key: "LW" | "ML"; readonly value: number }
  | { readonly key: "LC"; readonly value: LineCap }
  | { readonly key: "LJ"; readonly value: LineJoin }
  | { readonly key: "D"; readonly value: DashPattern }
  | { readonly key: "CA" | "ca"; readonly value: Alpha }
  | { readonly key: "BM"; readonly value: BlendMode }
  | { readonly key: "SMask"; readonly value: SoftMask }
  | {
      readonly key: "Font";
      readonly font: PdfDictionary;
      readonly size: number;
    };

type ParameterResult = Result<Option<ExtGStateParameter>, PdfError>;

/** 配列の直下の要素だけを解決し、辞書・ストリームの内部へは再帰しない。 */
const ExtGStateArray = {
  /**
   * 配列の要素を解決する。
   * @param array - 読み取った配列
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 参照解決エラーは Err、無効な参照は None
   */
  async resolve(
    array: PdfArray,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<readonly PdfObject[]>, PdfError>> {
    const values: PdfObject[] = [];
    for (const value of array.elements) {
      const result = await ResolveRef.object(value, resolveRef);
      if (!result.ok) {
        return result;
      }

      if (!result.value.some) {
        return ok(none);
      }

      values.push(result.value.value);
    }

    return ok(some(values));
  },
};

export const ExtGStateParameter = {
  /**
   * この実装で適用できるキーかを判定する。
   * @param key - PDF 辞書キー
   * @returns 対応するパラメータなら true
   */
  isSupported(key: string): key is ExtGStateParameter["key"] {
    return [
      "LW",
      "LC",
      "LJ",
      "ML",
      "D",
      "CA",
      "ca",
      "BM",
      "SMask",
      "Font",
    ].includes(key);
  },

  /**
   * 1つの辞書エントリを、キーに対応した型へ変換する。
   * @param entry - 対応済みキーと未解決の値
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 不正な値は None、参照解決の失敗は Err
   */
  async read(
    entry: {
      readonly key: ExtGStateParameter["key"];
      readonly value: PdfValue;
    },
    resolveRef: ResolveRef,
  ): Promise<ParameterResult> {
    const resolved = await ResolveRef.object(entry.value, resolveRef);
    if (!resolved.ok) {
      return resolved;
    }

    if (!resolved.value.some) {
      return ok(none);
    }

    const object = resolved.value.value;
    const key = entry.key;
    switch (key) {
      case "LW":
      case "ML":
        return ok(
          map(PdfObject.asFiniteNumber(object), (value) => ({ key, value })),
        );
      case "LC": {
        if (object.type !== "integer") {
          return ok(none);
        }

        const value = object.value;
        if (!LineCap.isValid(value)) {
          return ok(none);
        }

        return ok(some({ key, value: LineCap.create(value) }));
      }
      case "LJ": {
        if (object.type !== "integer") {
          return ok(none);
        }

        const value = object.value;
        if (!LineJoin.isValid(value)) {
          return ok(none);
        }

        return ok(some({ key, value: LineJoin.create(value) }));
      }
      case "CA":
      case "ca": {
        const number = PdfObject.asFiniteNumber(object);
        if (!number.some) {
          return ok(none);
        }

        return ok(map(Alpha.create(number.value), (value) => ({ key, value })));
      }
      case "SMask":
        return ok(
          map(SoftMask.fromObject(object), (value) => ({ key, value })),
        );
      case "BM":
        return ExtGStateParameter.readBlendMode(object, resolveRef);
      case "D":
      case "Font":
        return ExtGStateParameter.readPair({ key, object }, resolveRef);
    }
  },

  /**
   * ブレンドモードの優先順配列または単一名を読む。
   * @param object - 解決済みの /BM
   * @param resolveRef - 配列要素の参照解決関数
   * @returns 不正な型・未知の単一名は None。配列は最初の対応モード、なければ Normal
   */
  async readBlendMode(
    object: PdfObject,
    resolveRef: ResolveRef,
  ): Promise<ParameterResult> {
    if (object.type === "name") {
      return ok(
        map(BlendMode.fromName(object.value), (value) => ({
          key: "BM",
          value,
        })),
      );
    }

    if (object.type !== "array") {
      return ok(none);
    }

    const resolved = await ExtGStateArray.resolve(object, resolveRef);
    if (!resolved.ok) {
      return resolved;
    }

    if (!resolved.value.some) {
      return ok(none);
    }

    const names = resolved.value.value;
    if (!names.every((value) => value.type === "name")) {
      return ok(none);
    }

    const supported = names
      .map((name) => BlendMode.fromName(name.value))
      .find((mode) => mode.some);
    return ok(
      some({ key: "BM", value: supported?.value ?? BlendModes.Normal }),
    );
  },

  /**
   * 2要素の /D または /Font 配列を読む。
   * @param entry - キーと配列候補
   * @param resolveRef - 配列要素の参照解決関数
   * @returns 要素の型・個数が不正なら None、参照解決エラーは Err
   */
  async readPair(
    entry: { readonly key: "D" | "Font"; readonly object: PdfObject },
    resolveRef: ResolveRef,
  ): Promise<ParameterResult> {
    const object = entry.object;
    const pair = object.type === "array" && object.elements.length === 2;
    if (!pair) {
      return ok(none);
    }

    const resolved = await ExtGStateArray.resolve(object, resolveRef);
    if (!resolved.ok) {
      return resolved;
    }

    if (!resolved.value.some) {
      return ok(none);
    }

    const [first, second] = resolved.value.value;
    const number = PdfObject.asFiniteNumber(second);
    if (!number.some) {
      return ok(none);
    }

    if (entry.key === "Font") {
      return ok(
        first.type === "dictionary"
          ? some({ key: "Font", font: first, size: number.value })
          : none,
      );
    }

    if (first.type !== "array") {
      return ok(none);
    }

    const dash = await ExtGStateArray.resolve(first, resolveRef);
    if (!dash.ok) {
      return dash;
    }

    if (!dash.value.some) {
      return ok(none);
    }

    const numbers = dash.value.value.map(PdfObject.asFiniteNumber);
    if (!numbers.every((value) => value.some)) {
      return ok(none);
    }

    return ok(
      some({
        key: "D",
        value: DashPattern.create(
          numbers.map((value) => value.value),
          number.value,
        ),
      }),
    );
  },

  /**
   * 専用オペレータと同じ状態更新 API にパラメータを適用する。
   * @param state - 更新前のグラフィックス状態
   * @param parameter - 解決済みのパラメータ
   * @returns 指定したパラメータだけが変わった新しい状態
   */
  apply(state: GraphicsState, parameter: ExtGStateParameter): GraphicsState {
    switch (parameter.key) {
      case "LW":
        return GraphicsState.update(state, { lineWidth: parameter.value });
      case "LC":
        return GraphicsState.update(state, { lineCap: parameter.value });
      case "LJ":
        return GraphicsState.update(state, { lineJoin: parameter.value });
      case "ML":
        return GraphicsState.update(state, { miterLimit: parameter.value });
      case "D":
        return GraphicsState.update(state, { dashPattern: parameter.value });
      case "CA":
        return GraphicsState.update(state, { strokeAlpha: parameter.value });
      case "ca":
        return GraphicsState.update(state, { fillAlpha: parameter.value });
      case "BM":
        return GraphicsState.update(state, { blendMode: parameter.value });
      case "SMask":
        return GraphicsState.update(state, { softMask: parameter.value });
      case "Font":
        return GraphicsState.update(state, {
          textState: TextState.withFont(state.textState, {
            font: { type: "dictionary", dictionary: parameter.font },
            size: parameter.size,
          }),
        });
    }
  },
} as const;
