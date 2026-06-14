import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tjHandler } from "../index";

// text object が inactive なコンテキストを operand 付きで組むビルダ。
// （default の GraphicsStateStack.create() は textObject 非 active）
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

// active な text object を持つ最小コンテキストを組むビルダ（pop / 型検査用）。
const buildActiveContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject: TextObject.begin(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    activeState,
  );
  return { operandStack, graphicsStateStack };
};

const literalString = (bytes: number[]): PdfObject => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "literal",
});

test("inactive な state で Tj を実行すると OPERATOR_ILLEGAL_STATE を返す", () => {
  // BT/ET の外（textObject 非 active）で Tj が出現したとき illegal state として失敗すること
  const context = buildInactiveContext([literalString([0x48])]);

  const result = tjHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("illegal state エラーの operatorName が Tj である", () => {
  // エラーに反映される operator 名が PDF 表記の "Tj" であること
  const context = buildInactiveContext([literalString([0x48])]);

  const result = tjHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("Tj");
});

test("illegal state エラーの message が BT/ET 外を示す", () => {
  // ユーザー向けに BT/ET 外であることを説明する固定メッセージを返すこと
  const context = buildInactiveContext([literalString([0x48])]);

  const result = tjHandler(context);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "Tj: text object is not active (Tj must appear within BT/ET)",
  );
});

test("illegal state 時、operand stack は pop されず内容が保持される", () => {
  // active 検査は pop の前に置くため operand stack が一切触られないこと
  // depth が元のまま、かつ top の operand 内容も変化していないこと（peek で内容確認）
  const expected = literalString([0x48]);
  const context = buildInactiveContext([expected]);

  const result = tjHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(expected);
});

test("illegal state 時、graphics state stack の current は変化しない", () => {
  // ガード early-return により replaceCurrent が呼ばれず current 内部の textObject/textState が同一参照で残ること
  const context = buildInactiveContext([literalString([0x48])]);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjHandler(context);

  assert(!result.ok);
  const currentAfter = GraphicsStateStack.current(context.graphicsStateStack);
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});

test("active state で operand が 0 個のとき OPERATOR_OPERAND_MISSING を返す", () => {
  // active 検査を通過した後の pop で空が検出されエラーになること
  const context = buildActiveContext([]);

  const result = tjHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Tj");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'Tj' requires 1 operand(s), got 0",
  );
});

test("OPERAND_MISSING 時、graphics state stack の current は変化しない", () => {
  // pop 失敗で early-return するため replaceCurrent が呼ばれず current 内部参照が維持されること
  const context = buildActiveContext([]);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjHandler(context);

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
])("active state で operand が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (typeName, operand) => {
  const context = buildActiveContext([operand]);

  const result = tjHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Tj");
  expect(result.error.expected).toBe("string");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator 'Tj' expected string operand, got ${typeName}`,
  );
});

test("OPERAND_TYPE_MISMATCH 時、graphics state stack の current は変化しない", () => {
  // 型検査失敗で early-return するため replaceCurrent が呼ばれず current 内部参照が維持されること
  const context = buildActiveContext([{ type: "integer", value: 1 }]);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjHandler(context);

  assert(!result.ok);
  const currentAfter = GraphicsStateStack.current(context.graphicsStateStack);
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});

test("type mismatch 後、pop 済み operand は復元しない（余剰 operand のみ残る）", () => {
  // 既存ハンドラ規約: 部分消費した operand stack は復元しない。
  // 余剰として積んだ integer は残り、検査対象として pop された name は失われる。
  const context = buildActiveContext([
    { type: "integer", value: 99 },
    { type: "name", value: "F1" },
  ]);

  const result = tjHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual({ type: "integer", value: 99 });
});
