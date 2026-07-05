import { assert, expect, test } from "vitest";
import {
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { btHandler } from "../../bt/index";
import { etHandler } from "../index";

// inactive な初期 context を組むビルダ（registry/interpreter は使わずハンドラを直接連鎖適用する）
const buildContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  const graphicsStateStack = GraphicsStateStack.create();
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

test("BT → ET を連続適用すると textObject.active が false へ復帰する", () => {
  // BT で active 化した text object を ET が終了させ、ライフサイクルが閉じる
  const afterBt = btHandler(buildContext());
  assert(afterBt.ok);

  const afterEt = etHandler(afterBt.value);

  assert(afterEt.ok);
  const current = GraphicsStateStack.current(afterEt.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(false);
});

test("BT → ET 後の textMatrix / textLineMatrix が identity である", () => {
  // ET 終了後は両 matrix が identity に戻っている
  const afterBt = btHandler(buildContext());
  assert(afterBt.ok);

  const afterEt = etHandler(afterBt.value);

  assert(afterEt.ok);
  const current = GraphicsStateStack.current(afterEt.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(Matrix.identity());
  expect(current.textObject.textLineMatrix).toEqual(Matrix.identity());
});

test("BT を 2 回適用すると 2 回目が Err になる（BT BT）", () => {
  // 1 回目の BT で active 化済みの状態に再び BT を適用すると二重ネストで失敗する
  const afterBt = btHandler(buildContext());
  assert(afterBt.ok);

  const secondBt = btHandler(afterBt.value);

  assert(!secondBt.ok);
  assert(secondBt.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(secondBt.error.operatorName).toBe("BT");
});

test("inactive 初期状態で ET を単独適用すると Err になる", () => {
  // 対応する BT が無い ET は ET without BT として失敗する
  const result = etHandler(buildContext());

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("ET");
});

test("BT → ET 後に再度 BT → ET でライフサイクルを再開できる", () => {
  // ET 後に inactive へ正しく戻るため、2 周目の BT → ET も成功する（再ガードが効く）
  const afterFirstBt = btHandler(buildContext());
  assert(afterFirstBt.ok);
  const afterFirstEt = etHandler(afterFirstBt.value);
  assert(afterFirstEt.ok);

  const afterSecondBt = btHandler(afterFirstEt.value);
  assert(afterSecondBt.ok);
  const afterSecondEt = etHandler(afterSecondBt.value);

  assert(afterSecondEt.ok);
  const current = GraphicsStateStack.current(
    afterSecondEt.value.graphicsStateStack,
  );
  expect(TextObject.isActive(current.textObject)).toBe(false);
});
