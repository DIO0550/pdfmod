import type { PdfError } from "../../pdf/errors/index";
import type { Brand } from "../../utils/brand/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { GraphicsStateStack } from "../graphics-state/stack";
import type { OperandStack } from "../operand-stack/index";

declare const OperatorRegistryBrand: unique symbol;

/**
 * Content stream operator を実行するハンドラ。
 */
export type OperatorHandler = (
  stack: OperandStack,
  state: GraphicsStateStack,
) => Option<PdfError>;

/**
 * operator 名から実行ハンドラを引く registry。
 * 内部表現 `{ handlers: Map<string, OperatorHandler> }` を Brand 型で包むことで
 * 素のオブジェクトリテラルが代入されることを防ぐ。
 *
 * 注: `handlers` フィールドは型システム上はモジュール外からも参照可能だが、
 * 規約上 private 扱いとし、外部から `registry.handlers` に直接アクセス・変更してはならない。
 * 公開 API は companion object（`create` / `register` / `lookup` / `has`）のみ。
 */
export type OperatorRegistry = Brand<
  {
    handlers: Map<string, OperatorHandler>;
  },
  typeof OperatorRegistryBrand
>;

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
   * @param registry - 登録先 registry（mutate される）
   * @param name - operator 名
   * @param handler - 実行 handler
   * @returns 重複登録なら `Some(PdfError)`、成功なら `None`
   */
  register(
    registry: OperatorRegistry,
    name: string,
    handler: OperatorHandler,
  ): Option<PdfError> {
    if (registry.handlers.has(name)) {
      return some({
        code: "OPERATOR_ALREADY_REGISTERED",
        message: `Operator is already registered: ${name}`,
        operatorName: name,
      });
    }

    registry.handlers.set(name, handler);
    return none;
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
} as const;
