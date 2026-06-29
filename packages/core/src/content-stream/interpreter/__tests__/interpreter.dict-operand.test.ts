import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../pdf/index";
import { ok } from "../../../utils/result/index";
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

function popAll(stack: ReturnType<typeof OperandStack.create>): PdfObject[] {
  return Array.from({ length: OperandStack.depth(stack) }, () => {
    const value = OperandStack.pop(stack);
    assert(value.some);
    return value.value;
  });
}

test("`<</K /V>> op` operand を含む handler が PdfDictionary を pop できる", () => {
  const observed: PdfObject[][] = [];
  const registry = registerOperator(
    OperatorRegistry.create(),
    "op",
    (context) => {
      observed.push(popAll(context.operandStack));
      return ok(context);
    },
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("<</K /V>> op"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([
    [
      {
        type: "dictionary",
        entries: new Map([["K", { type: "name", value: "V" }]]),
      },
    ],
  ]);
});

// 未登録 operator は operand stack を clear するため、本テストでは「dict が積まれた後に
// BDC が dict を pop する」までは検証しない。全体完走と UNKNOWN_OPERATOR warning の
// 発火のみを smoke test として確認する。dict pop の検証は他のテストが担う。
test("`<</ActualText (x)>> BDC` は未登録 BDC で UNKNOWN_OPERATOR warning を出すが result.ok のまま完走する", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("<</ActualText (x)>> BDC"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(1);
  expect(result.value.warnings[0]?.code).toBe("UNKNOWN_OPERATOR");
  expect(result.value.warnings[0]?.message).toBe("Unknown operator: BDC");
});

// 辞書→配列の相互再帰経路を入口テストで pin down する。
test("`<</Subtype /Form /Matrix [1 0 0 1 0 0]>> capture` で 辞書内配列を保持したまま handler が pop できる", () => {
  const observed: PdfObject[][] = [];
  const registry = registerOperator(
    OperatorRegistry.create(),
    "capture",
    (context) => {
      observed.push(popAll(context.operandStack));
      return ok(context);
    },
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("<</Subtype /Form /Matrix [1 0 0 1 0 0]>> capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toHaveLength(1);
  const popped = observed[0];
  assert(popped !== undefined && popped.length === 1);
  const dict = popped[0];
  assert(dict !== undefined && dict.type === "dictionary");
  expect(dict.entries.get("Subtype")).toEqual({ type: "name", value: "Form" });
  expect(dict.entries.get("Matrix")).toEqual({
    type: "array",
    elements: [
      { type: "integer", value: 1 },
      { type: "integer", value: 0 },
      { type: "integer", value: 0 },
      { type: "integer", value: 1 },
      { type: "integer", value: 0 },
      { type: "integer", value: 0 },
    ],
  });
});
