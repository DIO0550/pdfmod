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
import { apostropheHandler } from "../index";

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

test("inactive な state で ' を実行すると OPERATOR_ILLEGAL_STATE を返す", () => {
  // BT/ET の外（textObject 非 active）で ' が出現したとき illegal state として失敗すること
  const context = buildInactiveContext([literalString([0x48])]);

  const result = apostropheHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("inactive で ' を実行したときエラーの operatorName が ' である", () => {
  // エラーに反映される operator 名が PDF 表記の "'" であること
  const context = buildInactiveContext([literalString([0x48])]);

  const result = apostropheHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("'");
});

test("inactive で ' を実行したときエラーの message が BT/ET 外を示す", () => {
  // ユーザー向けに BT/ET 外であることを説明する固定メッセージを返すこと
  const context = buildInactiveContext([literalString([0x48])]);

  const result = apostropheHandler(context);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "': text object is not active (' must appear within BT/ET)",
  );
});

test("illegal state 時、operand stack は pop されず内容が保持される", () => {
  // active 検査は pop の前に置くため operand stack が一切触られないこと
  const expected = literalString([0x48]);
  const context = buildInactiveContext([expected]);

  const result = apostropheHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(expected);
});

test("illegal state 時、graphics state stack は差し替えられず current が変更されない", () => {
  // ガードの early-return により replaceCurrent が呼ばれず、非 identity の matrix と
  // 非 default の textState（leading=14）がそのまま保持されること
  const context = buildInactiveNonIdentityContext();
  const stackBefore = context.graphicsStateStack;

  const result = apostropheHandler(context);

  assert(!result.ok);
  expect(context.graphicsStateStack).toBe(stackBefore);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textObject.textLineMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textState.leading).toBe(14);
  expect(TextObject.isActive(current.textObject)).toBe(false);
});

test("active かつ operand が 0 個のとき OPERATOR_OPERAND_MISSING を返す", () => {
  // active 検査を通過した後の pop で空が検出されエラーになること
  const context = buildActiveContext([], 14);

  const result = apostropheHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("'");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator ''' requires 1 operand(s), got 0",
  );
});

test("OPERAND_MISSING 時、graphics state stack の current は変化しない", () => {
  // pop 失敗で early-return するため replaceCurrent が呼ばれず current 内部参照が維持されること
  const context = buildActiveContext([], 14);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = apostropheHandler(context);

  assert(!result.ok);
  const currentAfter = GraphicsStateStack.current(context.graphicsStateStack);
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});

test.each<[string, PdfObject]>([
  ["integer", { type: "integer", value: 1 }],
  ["real", { type: "real", value: 1.5 }],
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
])("active state で operand が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (typeName, operand) => {
  const context = buildActiveContext([operand], 14);

  const result = apostropheHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("'");
  expect(result.error.expected).toBe("string");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator ''' expected string operand, got ${typeName}`,
  );
});

test("型不一致時、pop 済み operand は復元されない（余剰 operand のみ残る）", () => {
  // 既存ハンドラ規約: 部分消費した operand stack は復元しない。
  // 余剰として積んだ integer は残り、検査対象として pop された name は失われる。
  const context = buildActiveContext(
    [
      { type: "integer", value: 99 },
      { type: "name", value: "F1" },
    ],
    14,
  );

  const result = apostropheHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual({ type: "integer", value: 99 });
});

test("OPERAND_TYPE_MISMATCH 時、graphics state stack の current は変化しない", () => {
  // 型検査失敗で early-return するため replaceCurrent が呼ばれず current 内部参照が維持されること
  const context = buildActiveContext([{ type: "integer", value: 1 }], 14);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = apostropheHandler(context);

  assert(!result.ok);
  const currentAfter = GraphicsStateStack.current(context.graphicsStateStack);
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});
