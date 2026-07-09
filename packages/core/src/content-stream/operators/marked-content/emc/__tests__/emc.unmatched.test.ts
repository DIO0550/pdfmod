import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { emcHandler } from "../index";

/**
 * 空の marked content stack（depth=0）を持つ context を生成する。
 */
const buildEmptyContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
  markedContentStack: MarkedContentStack.create(),
});

test("空 stack（depth=0）で err を返す", () => {
  const ctx = buildEmptyContext();

  const result = emcHandler(ctx);

  assert(!result.ok);
});

test("エラー code が OPERATOR_ILLEGAL_STATE", () => {
  const ctx = buildEmptyContext();

  const result = emcHandler(ctx);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("エラー message が完全一致する", () => {
  const ctx = buildEmptyContext();

  const result = emcHandler(ctx);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "EMC: no open marked-content sequence (EMC without BMC/BDC)",
  );
});

test("operatorName が EMC", () => {
  const ctx = buildEmptyContext();

  const result = emcHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("EMC");
});

test("失敗時に入力 context の markedContentStack を変更しない（depth=0 のまま）", () => {
  const ctx = buildEmptyContext();

  const result = emcHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});
