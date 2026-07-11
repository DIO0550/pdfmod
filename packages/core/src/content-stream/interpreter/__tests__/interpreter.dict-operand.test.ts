import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../pdf/index";
import { ok } from "../../../utils/result/index";
import { MarkedContentStack } from "../../marked-content/stack/index";
import { OperandStack } from "../../operand-stack/index";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../operator-registry/index";
import { registerMarkedContentOperators } from "../../operators/marked-content/marked-content-operators/index";
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

// BDC は registerMarkedContentOperators 経由で登録済みのため、dict operand を
// pop して MarkedContentStack へ push する end-to-end のふるまいをここで pin down する。
// interpreter は末尾で markedContentStack 非空を OBJECT_PARSE_UNTERMINATED として弾く
// 仕様なので、BDC EMC のペアで 1 段開閉する形にする。
test("`/T <</ActualText (x)>> BDC EMC` は登録済み BDC/EMC が warning なしで 1 段開閉する", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("/T <</ActualText (x)>> BDC EMC"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
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
