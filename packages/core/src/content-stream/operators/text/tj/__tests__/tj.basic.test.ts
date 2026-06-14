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

// active な text object を持つ最小コンテキストを組むビルダ。
// （default の GraphicsStateStack.create() は textObject 非 active のため
//  TextObject.begin() を current に差し替える）
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

const hexString = (bytes: number[]): PdfObject => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "hex",
});

test("ASCII literal string operand を受理し ok を返す", () => {
  // "Hi" 相当のリテラル string を operand として与えると成功し、stack が 1 個減ること
  const context = buildActiveContext([literalString([0x48, 0x69])]);

  const result = tjHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test('hex string operand（encoding: "hex"）も同型として受理する', () => {
  // tokenizer/parser が literal / hex を単一 type: "string" として渡す前提を pin down
  const context = buildActiveContext([hexString([0x48, 0x69])]);

  const result = tjHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("空 string（0 バイト）operand でも成功する", () => {
  // 値域検証を行わないため、長さ 0 の Uint8Array でも operand 整合性のみで成功すること
  const context = buildActiveContext([literalString([])]);

  const result = tjHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("非ASCII byte（0x80+）の string operand を素通しして成功する", () => {
  // handler は byte 列の中身に解釈を加えず、型整合のみで受理すること
  const context = buildActiveContext([literalString([0x82, 0xa0])]);

  const result = tjHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時に graphicsStateStack は入力と同一参照で返る", () => {
  // 本フェーズでは graphics state を一切更新しないため replaceCurrent が呼ばれず
  // 同一参照のまま戻ること
  const context = buildActiveContext([literalString([0x48])]);

  const result = tjHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

test("成功時に operandStack は入力と同一参照で返る（in-place mutate）", () => {
  // OperandStack.pop は in-place mutate のため、handler は新しい stack を作らず
  // 入力の operand stack をそのまま（pop 済みで）返すこと
  const context = buildActiveContext([literalString([0x48])]);

  const result = tjHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

test("成功時に current の textObject と textState は同一参照で維持される", () => {
  // graphics state stack 同一参照に加え、current の内部フィールドも触られていないこと
  const context = buildActiveContext([literalString([0x48])]);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjHandler(context);

  assert(result.ok);
  const currentAfter = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  );
  expect(currentAfter.textObject).toBe(currentBefore.textObject);
  expect(currentAfter.textState).toBe(currentBefore.textState);
});

test("成功時に text object は active のまま維持される", () => {
  // Tj は active フラグに触れないため、後続 operator もそのまま BT/ET 内として処理可能であること
  const context = buildActiveContext([literalString([0x48])]);

  const result = tjHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(true);
});
