import { assert, expect, test } from "vitest";
import type {
  Token,
  TokenInlineImage,
  TokenInlineImageDictEntry,
} from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { GraphicsStateStack } from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../operator-registry/index";
import type { InlineImageDict } from "../../inline-image-dict/index";
import { inlineImageHandler } from "../index";

const buildEntry = (
  key: string,
  valueToken: Token,
): TokenInlineImageDictEntry => ({
  key: { type: TokenType.Name, value: key, offset: ByteOffset.of(0) },
  value: [valueToken],
});

const integerToken = (value: number): Token => ({
  type: TokenType.Integer,
  value,
  offset: ByteOffset.of(0),
});

const nameToken = (value: string): Token => ({
  type: TokenType.Name,
  value,
  offset: ByteOffset.of(0),
});

const buildInlineImageToken = (
  entries: InlineImageDict,
  data: Uint8Array = new Uint8Array([]),
): TokenInlineImage => ({
  type: TokenType.InlineImage,
  dict: entries,
  data,
  offset: ByteOffset.of(42),
});

const buildContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
});

test("完全名のみで揃った dict を受理する", () => {
  // Width / Height / BitsPerComponent / ColorSpace の 4 必須キーが完全名で揃っていれば成功する
  const token = buildInlineImageToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

test("略号のみで揃った dict を受理する（W / H / BPC / CS）", () => {
  // PDF §8.9.5.1 Table 89 の略号も InlineImageDict.normalize が完全名へ展開して通る
  const token = buildInlineImageToken([
    buildEntry("W", integerToken(1)),
    buildEntry("H", integerToken(1)),
    buildEntry("BPC", integerToken(8)),
    buildEntry("CS", nameToken("G")),
  ]);
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

test("data が空 Uint8Array でも成功する", () => {
  // 本フェーズは data の中身を見ないため、長さ 0 でも検査は通る
  const token = buildInlineImageToken(
    [
      buildEntry("Width", integerToken(1)),
      buildEntry("Height", integerToken(1)),
      buildEntry("BitsPerComponent", integerToken(8)),
      buildEntry("ColorSpace", nameToken("DeviceGray")),
    ],
    new Uint8Array([]),
  );
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
});

test("data が非空 Uint8Array でも成功する（中身は読まない）", () => {
  // zlib magic header のようなバイト列を渡しても decode せず素通しする
  const token = buildInlineImageToken(
    [
      buildEntry("Width", integerToken(1)),
      buildEntry("Height", integerToken(1)),
      buildEntry("BitsPerComponent", integerToken(8)),
      buildEntry("ColorSpace", nameToken("DeviceGray")),
    ],
    new Uint8Array([0x78, 0x9c, 0x00, 0x01, 0x02, 0x03]),
  );
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
});

test("成功時に operand stack と graphics state stack の参照を保持する", () => {
  // InlineImage は operand を取らず graphics state も更新しないため、
  // operand stack の depth と graphics state stack の current 参照がともに不変であることを 1 件で pin down
  const context = buildContext();
  OperandStack.push(context.operandStack, { type: "integer", value: 99 });
  const beforeDepth = OperandStack.depth(context.operandStack);
  const beforeCurrent = GraphicsStateStack.current(context.graphicsStateStack);

  const token = buildInlineImageToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);
  const result = inlineImageHandler(context, token);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(beforeDepth);
  expect(GraphicsStateStack.current(result.value.graphicsStateStack)).toBe(
    beforeCurrent,
  );
});

test("Width キーが存在し value が空配列でも成功する（本フェーズはキー存在のみ検査）", () => {
  // 値配列の中身（型 / 値域）は後続フェーズの責務で、handler は空配列を許容する
  const token = buildInlineImageToken([
    {
      key: { type: TokenType.Name, value: "Width", offset: ByteOffset.of(0) },
      value: [],
    },
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
});
