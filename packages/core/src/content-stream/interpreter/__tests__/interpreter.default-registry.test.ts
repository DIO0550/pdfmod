import { assert, expect, test } from "vitest";
import { ok } from "../../../utils/result/index";
import { GraphicsState, GraphicsStateStack } from "../../graphics-state/index";
import { OperandStack } from "../../operand-stack/index";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../operator-registry/index";
import { ContentStreamInterpreter } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

test("registry 省略時にグラフィックス状態オペレータ (q, cm, Q) がデフォルトレジストリで実行される", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("q 1 0 0 1 10 20 cm Q"),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
});

test("registry 省略時にテキストオペレータ (BT, Td, ET) がデフォルトレジストリで実行される", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("BT 10 20 Td ET"),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
});

test("明示的に渡されたカスタム registry が優先適用される", () => {
  const emptyRegistry = OperatorRegistry.create();
  const result = ContentStreamInterpreter.execute({
    data: encode("q Q"),
    registry: emptyRegistry,
  });

  assert(result.ok);
  expect(result.value.warnings.length).toBe(2);
  expect(result.value.warnings[0]?.code).toBe("UNKNOWN_OPERATOR");
  expect(result.value.warnings[1]?.code).toBe("UNKNOWN_OPERATOR");
});

test("デフォルトレジストリで未登録オペレータが出現した際 UNKNOWN_OPERATOR 警告を記録して継続する", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("q unknownOp Q"),
  });

  assert(result.ok);
  expect(result.value.warnings.length).toBe(1);
  expect(result.value.warnings[0]).toEqual({
    code: "UNKNOWN_OPERATOR",
    message: "Unknown operator: unknownOp",
    offset: 2,
  });
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});

test("デフォルトレジストリとカスタムオペレータの共存解釈ができる", () => {
  const defaultRegistryResult = OperatorRegistry.createDefault();
  assert(defaultRegistryResult.ok);

  let customOpCalled = false;
  const customHandler: OperatorHandler = (context) => {
    customOpCalled = true;
    return ok(context);
  };

  const registerResult = OperatorRegistry.register(
    defaultRegistryResult.value,
    "customOp",
    customHandler,
  );
  assert(registerResult.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("q customOp Q"),
    registry: registerResult.value,
  });

  assert(result.ok);
  expect(customOpCalled).toBe(true);
  expect(result.value.warnings).toEqual([]);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});

test("registry フィールドに明示的に undefined が渡された場合もデフォルトレジストリにフォールバックする", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("q 1 0 0 1 10 20 cm Q"),
    registry: undefined,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});

test("options.registry 省略時かつ空ストリーム（0バイト）実行時に初期 context で完了する", () => {
  const result = ContentStreamInterpreter.execute({
    data: new Uint8Array(0),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});
