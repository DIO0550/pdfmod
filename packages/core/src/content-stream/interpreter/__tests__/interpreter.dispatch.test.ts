import { assert, expect, test } from "vitest";
import type { PdfError, PdfObject } from "../../../pdf/index";
import { ok } from "../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  LineCap,
} from "../../graphics-state/index";
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

test("空inputはEOFでOk終了しfinal contextを返す", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode(""),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});

test("primitive operandはPdfObjectとしてhandlerからpopできる", () => {
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
    data: encode("true false 12 -3 4.5 /Name null capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([
    [
      { type: "null" },
      { type: "name", value: "Name" },
      { type: "real", value: 4.5 },
      { type: "integer", value: -3 },
      { type: "integer", value: 12 },
      { type: "boolean", value: false },
      { type: "boolean", value: true },
    ],
  ]);
});

test("literal stringとhex stringはbyte列を保持する", () => {
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
    data: encode("(A\\nB) <4142F> capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([
    [
      {
        type: "string",
        value: new Uint8Array([0x41, 0x42, 0xf0]),
        encoding: "hex",
      },
      {
        type: "string",
        value: new Uint8Array([0x41, 0x0a, 0x42]),
        encoding: "literal",
      },
    ],
  ]);
});

test.each([
  {
    input: "(\\400) capture",
    message: "Invalid literal string byte value",
  },
  {
    input: "<4Z> capture",
    message: "Invalid hex digits in hex string",
  },
])("文字列変換失敗はPdfErrorを返す: $input", ({ input, message }) => {
  const result = ContentStreamInterpreter.execute({
    data: encode(input),
    registry: OperatorRegistry.create(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toContain(message);
});

test.each([
  { input: ". capture", message: "NaN real token" },
  { input: "+ capture", message: "NaN integer token" },
  { input: "- capture", message: "NaN integer token" },
])("NaN数値tokenはPdfErrorを返す: $input", ({ input, message }) => {
  const result = ContentStreamInterpreter.execute({
    data: encode(input),
    registry: OperatorRegistry.create(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toContain(message);
});

// 残る 2 ケースは unbalanced delimiter (`]` / `>>` 単独) で、対応する `[` / `<<` が
// 先行しないため interpreter ループが直接 UNEXPECTED_TOKEN を返す。dict reader 完走パスは
// `interpreter.dict-operand.test.ts` 側に分離した。
test.each([
  { input: "] op", code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
  { input: ">> op", code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
])("unbalanced delimiter はstackを汚染せずErrで中断する: $input", ({
  input,
  code,
}) => {
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
    data: encode(input),
    registry,
  });

  assert(!result.ok);
  expect(result.error.code).toBe(code);
  expect(called).toBe(false);
});

// 配列リテラルが reader 経由で PdfArray として handler に渡る完走テスト
test("`[ (A) 120 ]` operand を含む handler が PdfArray を pop できる", () => {
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
    data: encode("[ (A) 120 ] capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([
    [
      {
        type: "array",
        elements: [
          {
            type: "string",
            value: new Uint8Array([0x41]),
            encoding: "literal",
          },
          { type: "integer", value: 120 },
        ],
      },
    ],
  ]);
});

// 未終端配列では handler が呼ばれず operand stack に副作用も残らない
test("`[1 2` を実行すると OBJECT_PARSE_UNTERMINATED で Err となり handler が呼ばれない", () => {
  let called = false;
  const registry = registerOperator(
    OperatorRegistry.create(),
    "capture",
    (context) => {
      called = true;
      return ok(context);
    },
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("[1 2"),
    registry,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
  expect(called).toBe(false);
});

// reader が完走した後に余剰 `]` が来ると interpreter ループが UNEXPECTED_TOKEN を返す
test("`[1] ] capture` で reader 完走後の余剰 `]` が OBJECT_PARSE_UNEXPECTED_TOKEN を返し handler 未実行", () => {
  let called = false;
  const registry = registerOperator(
    OperatorRegistry.create(),
    "capture",
    (context) => {
      called = true;
      return ok(context);
    },
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("[1] ] capture"),
    registry,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(called).toBe(false);
});

test("登録済みhandlerの更新contextは次operatorと最終resultへ引き継がれる", () => {
  const observedDepths: number[] = [];
  const firstRegistry = registerOperator(
    OperatorRegistry.create(),
    "first",
    (context) => {
      observedDepths.push(OperandStack.depth(context.operandStack));
      return ok({
        ...context,
        operandStack: OperandStack.create(),
      });
    },
  );
  const registry = registerOperator(firstRegistry, "second", (context) => {
    observedDepths.push(OperandStack.depth(context.operandStack));
    OperandStack.push(context.operandStack, { type: "integer", value: 99 });
    return ok(context);
  });

  const result = ContentStreamInterpreter.execute({
    data: encode("1 2 first 3 second"),
    registry,
  });

  assert(result.ok);
  expect(observedDepths).toEqual([2, 1]);
  expect(OperandStack.pop(result.value.context.operandStack)).toEqual({
    some: true,
    value: { type: "integer", value: 99 },
  });
  expect(result.value.warnings).toEqual([]);
});

test("未登録operatorに遭遇するとoperand stackがclearされ後続処理が継続する", () => {
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
    data: encode("1 2 unknown 3 capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([[{ type: "integer", value: 3 }]]);
  expect(result.value.warnings).toHaveLength(1);
});

test("未登録operatorに遭遇するとUNKNOWN_OPERATOR warningが1件emitされる", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("1 2 unknown"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([
    {
      code: "UNKNOWN_OPERATOR",
      message: "Unknown operator: unknown",
      offset: 4,
    },
  ]);
});

test("未登録operatorのwarning emit後、後続の登録済みoperatorが正常dispatchされる", () => {
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
    data: encode("unknown 42 capture"),
    registry,
  });

  assert(result.ok);
  expect(observed).toEqual([[{ type: "integer", value: 42 }]]);
  expect(result.value.warnings).toHaveLength(1);
});

test("同じ未登録operatorが2回現れるとwarningが2件emitされる", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("unknown unknown"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([
    {
      code: "UNKNOWN_OPERATOR",
      message: "Unknown operator: unknown",
      offset: 0,
    },
    {
      code: "UNKNOWN_OPERATOR",
      message: "Unknown operator: unknown",
      offset: 8,
    },
  ]);
});

test("空のoperand stackで未登録operatorに遭遇してもwarningが1件emitされエラーにならない", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("unknown"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([
    {
      code: "UNKNOWN_OPERATOR",
      message: "Unknown operator: unknown",
      offset: 0,
    },
  ]);
});

test("未登録operatorが連続するとwarningが連続emitされる", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("foo bar baz"),
    registry: OperatorRegistry.create(),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([
    { code: "UNKNOWN_OPERATOR", message: "Unknown operator: foo", offset: 0 },
    { code: "UNKNOWN_OPERATOR", message: "Unknown operator: bar", offset: 4 },
    { code: "UNKNOWN_OPERATOR", message: "Unknown operator: baz", offset: 8 },
  ]);
});

test("handlerのErrは同じerrorを返して後続operatorを実行しない", () => {
  const expectedError = {
    code: "NOT_IMPLEMENTED",
    message: "test failure",
  } satisfies PdfError;
  let laterCalled = false;
  const firstRegistry = registerOperator(
    OperatorRegistry.create(),
    "fail",
    () => ({
      ok: false,
      error: expectedError,
    }),
  );
  const registry = registerOperator(firstRegistry, "later", (context) => {
    laterCalled = true;
    return ok(context);
  });

  const result = ContentStreamInterpreter.execute({
    data: encode("fail later"),
    registry,
  });

  expect(result).toEqual({ ok: false, error: expectedError });
  expect(laterCalled).toBe(false);
});

test("qとQはregistry handler経由でgraphics state stackを更新する", () => {
  const qRegistry = registerOperator(
    OperatorRegistry.create(),
    "q",
    (context) =>
      ok({
        ...context,
        graphicsStateStack: GraphicsStateStack.save(context.graphicsStateStack),
      }),
  );
  const changeRegistry = registerOperator(qRegistry, "change", (context) =>
    ok({
      ...context,
      graphicsStateStack: GraphicsStateStack.replaceCurrent(
        context.graphicsStateStack,
        GraphicsState.update(
          GraphicsStateStack.current(context.graphicsStateStack),
          {
            lineCap: LineCap.create(2),
            lineWidth: 8,
          },
        ),
      ),
    }),
  );
  const registry = registerOperator(changeRegistry, "Q", (context) =>
    ok({
      ...context,
      graphicsStateStack: GraphicsStateStack.restore(context.graphicsStateStack)
        .stack,
    }),
  );

  const result = ContentStreamInterpreter.execute({
    data: encode("q change Q"),
    registry,
  });

  assert(result.ok);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});
