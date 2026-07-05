import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../pdf/types/pdf-types/index";
import { ok } from "../../../utils/result/index";
import { GraphicsStateStack } from "../../graphics-state/index";
import { MarkedContentStack } from "../../marked-content/stack";
import { OperandStack } from "../../operand-stack/index";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../operator-registry/index";
import { ContentStreamInterpreter } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

function registerOperator(
  registry: ReturnType<typeof OperatorRegistry.create>,
  name: string,
  handler: OperatorHandler,
): ReturnType<typeof OperatorRegistry.create> {
  const result = OperatorRegistry.register(registry, name, handler);
  assert(result.ok);
  return result.value;
}

test("BI /W 1 /H 1 /CS /G /BPC 8 ID x EI を含む stream が green に流れる", () => {
  // 標準的な inline image: NOT_IMPLEMENTED で中断していた挙動が解消されることを pin down
  const result = ContentStreamInterpreter.execute({
    data: encode("BI /W 1 /H 1 /CS /G /BPC 8 ID x EI"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
});

test("inline image の前後で operand stack / graphics state stack は同一参照", () => {
  // initialContext を渡して参照同一性を比較する。inline image は state を変更しない
  const initialContext = {
    operandStack: OperandStack.create(),
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };
  const before = GraphicsStateStack.current(initialContext.graphicsStateStack);

  const result = ContentStreamInterpreter.execute({
    data: encode("BI /W 1 /H 1 /CS /G /BPC 8 ID x EI"),
    registry: OperatorRegistry.create(),
    initialContext,
  });

  assert(result.ok);
  expect(result.value.context.operandStack).toBe(initialContext.operandStack);
  expect(result.value.context.graphicsStateStack).toBe(
    initialContext.graphicsStateStack,
  );
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toBe(before);
});

test("必須キー欠落の inline image は INLINE_IMAGE_REQUIRED_KEY_MISSING で中断する", () => {
  // /W (Width) を欠落させると handler が err を返し interpreter が伝搬する
  const result = ContentStreamInterpreter.execute({
    data: encode("BI /H 1 /CS /G /BPC 8 ID x EI"),
    registry: OperatorRegistry.create(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("INLINE_IMAGE_REQUIRED_KEY_MISSING");
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("Width");
});

test("/IM true ImageMask は ColorSpace なしでも green に流れる", () => {
  // PDF §8.9.6 stencil mask 例外が end-to-end で動作する
  const result = ContentStreamInterpreter.execute({
    data: encode("BI /W 1 /H 1 /BPC 1 /IM true ID x EI"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
});

test("BI ... EI の後に登録済み operator が呼ばれる", () => {
  // inline image 通過後も interpreter loop が継続し後続 operator が dispatch される
  let called = false;
  const registry = registerOperator(
    OperatorRegistry.create(),
    "op",
    (context) => {
      called = true;
      return ok(context);
    },
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("BI /W 1 /H 1 /CS /G /BPC 8 ID x EI op"),
    registry,
  });

  assert(result.ok);
  expect(called).toBe(true);
});

test("BI ... EI の前に積まれた operand は inline image 後も残る", () => {
  // operand stack は inline image で変化しない不変条件を pin down
  const observed: PdfObject[][] = [];
  const registry = registerOperator(
    OperatorRegistry.create(),
    "capture",
    (context) => {
      observed.push(
        Array.from({ length: OperandStack.depth(context.operandStack) }, () => {
          const popped = OperandStack.pop(context.operandStack);
          assert(popped.some);
          return popped.value;
        }),
      );
      return ok(context);
    },
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("42 BI /W 1 /H 1 /CS /G /BPC 8 ID x EI capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([[{ type: "integer", value: 42 }]]);
});
