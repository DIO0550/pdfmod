import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
  TextState,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { quoteHandler } from "../index";

// active=true / leading 任意 の context を組み立てる。
const buildActiveContext = (
  operands: PdfObject[],
  leading: number = 0,
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject: TextObject.begin(),
    textState: TextState.update(TextState.create(), { leading }),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    activeState,
  );
  return { operandStack, graphicsStateStack };
};

// active=false (BT 未発行) の context を組み立てる。
const buildInactiveContext = (
  operands: PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

// inactive かつ非 identity の matrix / 非 default の leading を持つ context。
// ガードを通らず translateLine が誤って呼ばれた場合に matrix が変化することを検出するための fixture。
const NON_IDENTITY_MATRIX = Matrix.create(2, 0, 0, 2, 10, 20);
const buildInactiveNonIdentityContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  const inactiveNonIdentity = {
    active: false,
    textMatrix: NON_IDENTITY_MATRIX,
    textLineMatrix: NON_IDENTITY_MATRIX,
  } as unknown as TextObject;
  const state = GraphicsState.update(GraphicsState.create(), {
    textObject: inactiveNonIdentity,
    textState: TextState.update(TextState.create(), { leading: 14 }),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    state,
  );
  return { operandStack, graphicsStateStack };
};

const literalString = (bytes: number[]): PdfObject => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "literal",
});

const int = (value: number): PdfObject => ({ type: "integer", value });
const real = (value: number): PdfObject => ({ type: "real", value });

test('inactive な state で " を実行すると OPERATOR_ILLEGAL_STATE を返す', () => {
  // BT/ET の外（textObject 非 active）で " が出現したとき illegal state として失敗すること
  const context = buildInactiveContext([int(2), int(1), literalString([0x48])]);

  const result = quoteHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test('inactive で " を実行したときエラーの operatorName が " である', () => {
  // エラーに反映される operator 名が PDF 表記の '"' であること
  const context = buildInactiveContext([int(2), int(1), literalString([0x48])]);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe('"');
});

test('inactive で " を実行したときエラーの message が BT/ET 外を示す', () => {
  // ユーザー向けに BT/ET 外であることを説明する固定メッセージを返すこと
  const context = buildInactiveContext([int(2), int(1), literalString([0x48])]);

  const result = quoteHandler(context);

  assert(!result.ok);
  expect(result.error.message).toBe(
    '": text object is not active (" must appear within BT/ET)',
  );
});

test("illegal state 時、operand stack は pop されず内容が保持される", () => {
  // active 検査は pop の前に置くため operand stack が一切触られないこと
  const aw = int(2);
  const ac = int(1);
  const stringOperand = literalString([0x48]);
  const context = buildInactiveContext([aw, ac, stringOperand]);

  const result = quoteHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(3);
});

test("illegal state 時、graphics state stack は差し替えられず current が変更されない", () => {
  // ガードの early-return により replaceCurrent が呼ばれず、非 identity の matrix と
  // 非 default の textState（leading=14）がそのまま保持されること
  const context = buildInactiveNonIdentityContext();
  const stackBefore = context.graphicsStateStack;

  const result = quoteHandler(context);

  assert(!result.ok);
  expect(context.graphicsStateStack).toBe(stackBefore);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textObject.textLineMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textState.leading).toBe(14);
  expect(TextObject.isActive(current.textObject)).toBe(false);
});

test("active かつ operand が 0 個のとき OPERAND_MISSING(actual=0) を返す", () => {
  // active 検査を通過した後の string pop で空が検出されエラーになること
  const context = buildActiveContext([], 14);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe('"');
  expect(result.error.required).toBe(3);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    `Operator '"' requires 3 operand(s), got 0`,
  );
});

test("active かつ operand が 1 個（string のみ正しい）のとき OPERAND_MISSING(actual=1)", () => {
  // string pop は成功、ac pop で空が検出されること
  const context = buildActiveContext([literalString([0x48])], 14);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.required).toBe(3);
  expect(result.error.actual).toBe(1);
  expect(result.error.message).toBe(
    `Operator '"' requires 3 operand(s), got 1`,
  );
});

test("active かつ operand が 2 個（string + ac 正しい）のとき OPERAND_MISSING(actual=2)", () => {
  // string と ac の pop は成功、aw pop で空が検出されること
  const context = buildActiveContext([int(1), literalString([0x48])], 14);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.required).toBe(3);
  expect(result.error.actual).toBe(2);
  expect(result.error.message).toBe(
    `Operator '"' requires 3 operand(s), got 2`,
  );
});

test("OPERAND_MISSING 時、graphics state stack の current は変化しない", () => {
  // pop 失敗で early-return するため replaceCurrent が呼ばれず current 内部参照が維持されること
  const context = buildActiveContext([], 14);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = quoteHandler(context);

  assert(!result.ok);
  const currentAfter = GraphicsStateStack.current(context.graphicsStateStack);
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});

test('active で string operand が非 string（integer）のとき TYPE_MISMATCH(expected="string")', () => {
  // string 型検査ブロックが先に発火すること（pop 順 string→ac→aw）
  const context = buildActiveContext([int(2), int(1), int(99)], 14);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe('"');
  expect(result.error.expected).toBe("string");
  expect(result.error.actual).toBe("integer");
  expect(result.error.message).toBe(
    `Operator '"' expected string operand, got integer`,
  );
});

test('active で ac が非 numeric（name）のとき TYPE_MISMATCH(expected="number")', () => {
  // string 型検査を通った後、ac 型検査で発火すること
  const context = buildActiveContext(
    [int(2), { type: "name", value: "F1" }, literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("name");
  expect(result.error.message).toBe(
    `Operator '"' expected number operand, got name`,
  );
});

test('active で aw が非 numeric（boolean）のとき TYPE_MISMATCH(expected="number")', () => {
  // string と ac の型検査を通った後、aw 型検査で発火すること
  const context = buildActiveContext(
    [{ type: "boolean", value: true }, int(1), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("boolean");
  expect(result.error.message).toBe(
    `Operator '"' expected number operand, got boolean`,
  );
});

const NON_STRING_OPERANDS: ReadonlyArray<readonly [string, PdfObject]> = [
  ["integer", int(1)],
  ["real", real(1.5)],
  ["name", { type: "name", value: "F1" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
  [
    "stream",
    {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  ],
];

test.each(
  NON_STRING_OPERANDS,
)('active で string 位置に %s が渡ると expected="string" の TYPE_MISMATCH', (typeName, operand) => {
  const context = buildActiveContext([int(2), int(1), operand], 14);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("string");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator '"' expected string operand, got ${typeName}`,
  );
});

const NON_NUMERIC_OPERANDS: ReadonlyArray<readonly [string, PdfObject]> = [
  ["string", literalString([0x41])],
  ["name", { type: "name", value: "F1" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
  [
    "stream",
    {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  ],
];

test.each(
  NON_NUMERIC_OPERANDS,
)('active で ac 位置に %s が渡ると expected="number" の TYPE_MISMATCH', (typeName, operand) => {
  const context = buildActiveContext(
    [int(2), operand, literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator '"' expected number operand, got ${typeName}`,
  );
});

test.each(
  NON_NUMERIC_OPERANDS,
)('active で aw 位置に %s が渡ると expected="number" の TYPE_MISMATCH', (typeName, operand) => {
  const context = buildActiveContext(
    [operand, int(1), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator '"' expected number operand, got ${typeName}`,
  );
});

test("TYPE_MISMATCH(string) 時、graphics state stack の current は変化しない", () => {
  // string 型検査失敗で early-return するため replaceCurrent が呼ばれず維持されること
  const context = buildActiveContext([int(2), int(1), int(99)], 14);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = quoteHandler(context);

  assert(!result.ok);
  const currentAfter = GraphicsStateStack.current(context.graphicsStateStack);
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});

test("検査順序: string mismatch が先に発火し ac/aw は pop されない（残 2 個）", () => {
  // string が非 string、ac/aw が numeric の場合、string TYPE_MISMATCH のみで離脱し
  // ac/aw は operand stack に残ること
  const awRemaining = int(2);
  const acRemaining = int(1);
  const context = buildActiveContext([awRemaining, acRemaining, int(99)], 14);

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("string");
  // string 1 個だけ pop され、残 2 個が stack に残る
  expect(OperandStack.depth(context.operandStack)).toBe(2);
});

test("検査順序: ac mismatch が先に発火し aw は pop されない（残 1 個）", () => {
  // string ok + ac 非 numeric + aw 非 numeric の場合、ac TYPE_MISMATCH のみで離脱し
  // aw は operand stack に残ること
  const awRemaining: PdfObject = { type: "boolean", value: true };
  const context = buildActiveContext(
    [awRemaining, { type: "name", value: "F1" }, literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("name");
  // string と ac で 2 個 pop され、aw 1 個が stack に残る
  expect(OperandStack.depth(context.operandStack)).toBe(1);
});
