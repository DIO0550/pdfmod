import type { PdfError } from "../../pdf/errors/index";
import type { Brand } from "../../utils/brand/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { Result } from "../../utils/result/index";
import { err, flatMap, ok } from "../../utils/result/index";
import type { GraphicsStateStack } from "../graphics-state/stack";
import type { MarkedContentStack } from "../marked-content/stack";
import type { OperandStack } from "../operand-stack/index";
import { kHandler } from "../operators/color/cmyk/fill";
import { KHandler } from "../operators/color/cmyk/stroke";
import { gHandler } from "../operators/color/gray/fill";
import { GHandler } from "../operators/color/gray/stroke";
import { rgHandler } from "../operators/color/rgb/fill";
import { RGHandler } from "../operators/color/rgb/stroke";
import { cmHandler } from "../operators/graphics-state/cm/index";
import { dHandler } from "../operators/graphics-state/d/index";
import { flatnessHandler } from "../operators/graphics-state/i/index";
import { lineCapHandler } from "../operators/graphics-state/line-cap-handler/index";
import { lineJoinHandler } from "../operators/graphics-state/line-join-handler/index";
import { lineWidthHandler } from "../operators/graphics-state/line-width-handler/index";
import { miterLimitHandler } from "../operators/graphics-state/miter-limit-handler/index";
import { qHandler } from "../operators/graphics-state/q/index";
import { qRestoreHandler } from "../operators/graphics-state/q-restore/index";
import { riHandler } from "../operators/graphics-state/ri/index";
import { bdcHandler } from "../operators/marked-content/bdc/index";
import { bmcHandler } from "../operators/marked-content/bmc/index";
import { dpHandler } from "../operators/marked-content/dp/index";
import { emcHandler } from "../operators/marked-content/emc/index";
import { mpHandler } from "../operators/marked-content/mp/index";
import { cHandler } from "../operators/path/c/index";
import { clipHandler } from "../operators/path/clip/index";
import { clipEvenOddHandler } from "../operators/path/clip-even-odd/index";
import { closeFillStrokeHandler } from "../operators/path/close-fill-stroke/index";
import { closeFillStrokeEvenOddHandler } from "../operators/path/close-fill-stroke-even-odd/index";
import { closeStrokeHandler } from "../operators/path/close-stroke/index";
import { endPathHandler } from "../operators/path/end-path/index";
import { fillHandler } from "../operators/path/fill/index";
import { fillEvenOddHandler } from "../operators/path/fill-even-odd/index";
import { fillStrokeHandler } from "../operators/path/fill-stroke/index";
import { fillStrokeEvenOddHandler } from "../operators/path/fill-stroke-even-odd/index";
import { hHandler } from "../operators/path/h/index";
import { lHandler } from "../operators/path/l/index";
import { mHandler } from "../operators/path/m/index";
import { reHandler } from "../operators/path/re/index";
import { strokeHandler } from "../operators/path/stroke/index";
import { vHandler } from "../operators/path/v/index";
import { yHandler } from "../operators/path/y/index";
import { apostropheHandler } from "../operators/text/apostrophe/index";
import { btHandler } from "../operators/text/bt/index";
import { etHandler } from "../operators/text/et/index";
import { quoteHandler } from "../operators/text/quote/index";
import { tStarHandler } from "../operators/text/t-star/index";
import { tcHandler } from "../operators/text/tc/index";
import { tdHandler } from "../operators/text/td/index";
import { tdLeadingHandler } from "../operators/text/td-leading/index";
import { tfHandler } from "../operators/text/tf/index";
import { tjHandler } from "../operators/text/tj/index";
import { tjArrayHandler } from "../operators/text/tj-array/index";
import { tlHandler } from "../operators/text/tl/index";
import { tmHandler } from "../operators/text/tm/index";
import { trHandler } from "../operators/text/tr/index";
import { tsHandler } from "../operators/text/ts/index";
import { twHandler } from "../operators/text/tw/index";
import { tzHandler } from "../operators/text/tz/index";
import { doHandler } from "../operators/xobject/do/index";

declare const OperatorRegistryBrand: unique symbol;

/**
 * Content stream operator handler が受け取り、更新後に返す実行コンテキスト。
 */
export type OperatorHandlerContext = {
  /** PDF content stream の operand stack */
  readonly operandStack: OperandStack;
  /** 現在の graphics state stack */
  readonly graphicsStateStack: GraphicsStateStack;
  /** BMC/BDC/EMC 由来の marked content stack (ISO 32000-2:2020 §14.6) */
  readonly markedContentStack: MarkedContentStack;
};

/**
 * Content stream operator を実行するハンドラ。
 */
export type OperatorHandler = (
  context: OperatorHandlerContext,
) => Result<OperatorHandlerContext, PdfError>;

/**
 * operator 名から実行ハンドラを引く registry。
 * 内部表現 `{ handlers: Map<string, OperatorHandler> }` を Brand 型で包むことで
 * 素のオブジェクトリテラルが代入されることを防ぐ。
 *
 * 注: `handlers` フィールドは型システム上はモジュール外からも参照可能だが、
 * 規約上 private 扱いとし、外部から `registry.handlers` に直接アクセス・変更してはならない。
 * 状態変更が必要な操作は元 registry を mutate せず、新しい registry を返す。
 * 公開 API は companion object（`create` / `register` / `lookup` / `has`）のみ。
 */
export type OperatorRegistry = Brand<
  {
    handlers: Map<string, OperatorHandler>;
  },
  typeof OperatorRegistryBrand
>;

const BUILTIN_OPERATORS: ReadonlyArray<readonly [string, OperatorHandler]> = [
  ["G", GHandler],
  ["g", gHandler],
  ["RG", RGHandler],
  ["rg", rgHandler],
  ["K", KHandler],
  ["k", kHandler],
  ["cm", cmHandler],
  ["w", lineWidthHandler],
  ["J", lineCapHandler],
  ["j", lineJoinHandler],
  ["M", miterLimitHandler],
  ["d", dHandler],
  ["ri", riHandler],
  ["i", flatnessHandler],
  ["q", qHandler],
  ["Q", qRestoreHandler],
  ["BMC", bmcHandler],
  ["EMC", emcHandler],
  ["BDC", bdcHandler],
  ["MP", mpHandler],
  ["DP", dpHandler],
  ["m", mHandler],
  ["l", lHandler],
  ["c", cHandler],
  ["v", vHandler],
  ["y", yHandler],
  ["h", hHandler],
  ["re", reHandler],
  ["W", clipHandler],
  ["W*", clipEvenOddHandler],
  ["S", strokeHandler],
  ["s", closeStrokeHandler],
  ["f", fillHandler],
  ["F", fillHandler],
  ["f*", fillEvenOddHandler],
  ["B", fillStrokeHandler],
  ["B*", fillStrokeEvenOddHandler],
  ["b", closeFillStrokeHandler],
  ["b*", closeFillStrokeEvenOddHandler],
  ["n", endPathHandler],
  ["Td", tdHandler],
  ["TD", tdLeadingHandler],
  ["Tm", tmHandler],
  ["T*", tStarHandler],
  ["Tj", tjHandler],
  ["TJ", tjArrayHandler],
  ["'", apostropheHandler],
  ['"', quoteHandler],
  ["BT", btHandler],
  ["ET", etHandler],
  ["Tf", tfHandler],
  ["Tc", tcHandler],
  ["Tw", twHandler],
  ["Tz", tzHandler],
  ["TL", tlHandler],
  ["Tr", trHandler],
  ["Ts", tsHandler],
  ["Do", doHandler],
];

export const OperatorRegistry = {
  /**
   * 空の operator registry を生成する。
   *
   * @returns handler 未登録の `OperatorRegistry`
   */
  create(): OperatorRegistry {
    return {
      handlers: new Map<string, OperatorHandler>(),
    } as unknown as OperatorRegistry;
  },

  /**
   * operator 名に handler を登録する。
   *
   * @param registry - 登録元 registry
   * @param name - operator 名
   * @param handler - 実行 handler
   * @returns 成功なら handler 追加済みの新しい `OperatorRegistry`、重複登録なら `PdfError`
   */
  register(
    registry: OperatorRegistry,
    name: string,
    handler: OperatorHandler,
  ): Result<OperatorRegistry, PdfError> {
    if (registry.handlers.has(name)) {
      return err({
        code: "OPERATOR_ALREADY_REGISTERED",
        message: `Operator is already registered: ${name}`,
        operatorName: name,
      });
    }

    return ok({
      handlers: new Map(registry.handlers).set(name, handler),
    } as unknown as OperatorRegistry);
  },

  /**
   * operator 名から handler を取得する。
   *
   * @param registry - 検索対象 registry
   * @param name - operator 名
   * @returns 登録済みなら `Some(handler)`、未登録なら `None`
   */
  lookup(registry: OperatorRegistry, name: string): Option<OperatorHandler> {
    const handler = registry.handlers.get(name);
    if (handler === undefined) {
      return none;
    }
    return some(handler);
  },

  /**
   * operator 名に handler が登録済みか判定する。
   *
   * @param registry - 検索対象 registry
   * @param name - operator 名
   * @returns 登録済みなら true
   */
  has(registry: OperatorRegistry, name: string): boolean {
    return registry.handlers.has(name);
  },

  /**
   * 全ビルトインオペレータが登録されたデフォルトの `OperatorRegistry` を生成する。
   *
   * @returns 全ビルトインオペレータ登録済みの OperatorRegistry、または重複登録時の PdfError
   */
  createDefault(): Result<OperatorRegistry, PdfError> {
    return BUILTIN_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
      (acc, [name, handler]) =>
        flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
      ok(OperatorRegistry.create()),
    );
  },
} as const;
