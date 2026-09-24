import { assert, describe, expect, it } from "vitest";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { createTextStateNumberOperator } from "../index";

const createContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
  markedContentStack: MarkedContentStack.create(),
});

describe("createTextStateNumberOperator", () => {
  it("指定プロパティを正常に更新する (Tc -> charSpace)", () => {
    const handler = createTextStateNumberOperator("Tc", "charSpace");
    const ctx = createContext();
    OperandStack.push(ctx.operandStack, { type: "real", value: 1.5 });

    const result = handler(ctx);
    assert(result.ok);
    const current = GraphicsStateStack.current(result.value.graphicsStateStack);
    expect(current.textState.charSpace).toBe(1.5);
    expect(OperandStack.depth(result.value.operandStack)).toBe(0);
  });

  it("スタック空時は OPERATOR_OPERAND_MISSING エラーを伝播する", () => {
    const handler = createTextStateNumberOperator("Tw", "wordSpace");
    const ctx = createContext();

    const result = handler(ctx);
    assert(!result.ok);
    assert(result.error.code === "OPERATOR_OPERAND_MISSING");
    expect(result.error.operatorName).toBe("Tw");
  });

  it("型不一致時は OPERATOR_OPERAND_TYPE_MISMATCH エラーを伝播する", () => {
    const handler = createTextStateNumberOperator("Tz", "horizontalScaling");
    const ctx = createContext();
    OperandStack.push(ctx.operandStack, { type: "name", value: "invalid" });

    const result = handler(ctx);
    assert(!result.ok);
    assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
    expect(result.error.operatorName).toBe("Tz");
  });
});
