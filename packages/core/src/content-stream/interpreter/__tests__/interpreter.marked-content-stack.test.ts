import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../graphics-state/index";
import { MarkedContentStack } from "../../marked-content/stack";
import { OperandStack } from "../../operand-stack/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { ContentStreamInterpreter } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

test("初期contextのmarkedContentStackは深さ0の空stackである", () => {
  // initialContext 未指定で execute すると createInitialContext が空 stack を生成する
  const result = ContentStreamInterpreter.execute({
    data: encode(""),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("executeを2回呼ぶと返されるmarkedContentStackは別インスタンスである", () => {
  // createInitialContext が factory を毎回呼ぶ間接検証
  const r1 = ContentStreamInterpreter.execute({
    data: encode(""),
    registry: OperatorRegistry.create(),
  });
  const r2 = ContentStreamInterpreter.execute({
    data: encode(""),
    registry: OperatorRegistry.create(),
  });

  assert(r1.ok);
  assert(r2.ok);
  expect(r1.value.context.markedContentStack).not.toBe(
    r2.value.context.markedContentStack,
  );
});

test("外部注入したinitialContext.markedContentStackはそのまま透過して返る", () => {
  // initialContext !== undefined 分岐の既存挙動（呼び出し側の stack を尊重）を pin down
  const initialContext = {
    operandStack: OperandStack.create(),
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };

  const result = ContentStreamInterpreter.execute({
    data: encode(""),
    registry: OperatorRegistry.create(),
    initialContext,
  });

  assert(result.ok);
  expect(result.value.context.markedContentStack).toBe(
    initialContext.markedContentStack,
  );
});
