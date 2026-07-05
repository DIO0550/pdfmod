import { assert, expect, test } from "vitest";
import { flatMap, ok } from "../../../../../utils/result/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import type { ContentStreamInterpreterResult } from "../../../../interpreter/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../../operator-registry/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerGraphicsStateOperators } from "../../../graphics-state/graphics-state-operators/index";
import { registerTextStateOperators } from "../../../text/text-state-operators/index";
import { registerXObjectOperators } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

// NOTE: q (gsave) / Q (grestore) operator は現状コードベース全体で未実装のため、
// integration テスト用に inline 定義する。本実装されたら inline 定義は削除し、
// 対応する register*Operators 経由の登録に置き換える。
const qHandler: OperatorHandler = (context) =>
  ok({
    ...context,
    graphicsStateStack: GraphicsStateStack.save(context.graphicsStateStack),
    markedContentStack: MarkedContentStack.create(),
  });

const qRestoreHandler: OperatorHandler = (context) =>
  ok({
    ...context,
    graphicsStateStack: GraphicsStateStack.restore(context.graphicsStateStack),
    markedContentStack: MarkedContentStack.create(),
  });

// XObject + text-state + graphics-state (cm/w/J/j/M) + inline q/Q を併用登録した registry を作るヘルパ。
// graphics-state barrel は q/Q を含まないため inline 定義との衝突は無い。
// 登録失敗は assert で即座に検出する。
const createRegistry = (): OperatorRegistry => {
  const withXObject = registerXObjectOperators(OperatorRegistry.create());
  const withTextState = flatMap(withXObject, registerTextStateOperators);
  const withGraphicsState = flatMap(
    withTextState,
    registerGraphicsStateOperators,
  );
  const withQ = flatMap(withGraphicsState, (r) =>
    OperatorRegistry.register(r, "q", qHandler),
  );
  const withQQ = flatMap(withQ, (r) =>
    OperatorRegistry.register(r, "Q", qRestoreHandler),
  );
  assert(withQQ.ok);
  return withQQ.value;
};

// 正常系用: content stream を実行し成功結果を返すヘルパ（失敗時は assert で即座に検出）。
const execute = (
  stream: string,
  initialContext?: OperatorHandlerContext,
): ContentStreamInterpreterResult => {
  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: createRegistry(),
    initialContext,
  });
  assert(result.ok);
  return result.value;
};

// q cm /Im0 Do Q の典型的な XObject 描画フローが warnings なく完走し
// /Im0 Name operand が Do に消費されて operandStack が空になることを検証する
test("q cm /Im0 Do Q のシーケンスで Do が dispatch され warnings が空・operand 消費される", () => {
  const result = execute("q 200 0 0 300 50 400 cm /Im0 Do Q");
  expect(result.warnings).toEqual([]);
  // Do が /Im0 operand を pop している（消費せず残ると depth > 0 になる）
  expect(OperandStack.depth(result.context.operandStack)).toBe(0);
});

// BT/ET 内側で Do が呼ばれてもテキストオブジェクト状態を破壊せず
// /Fm1 operand が Do に消費されて operandStack が空になることを検証する
test("BT /Fm1 Do ET のテキストオブジェクト内側でも Do が成功し operand 消費される", () => {
  const result = execute("BT /Fm1 Do ET");
  expect(result.warnings).toEqual([]);
  expect(OperandStack.depth(result.context.operandStack)).toBe(0);
});
