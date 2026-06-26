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
  entries: ReadonlyArray<TokenInlineImageDictEntry>,
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

test("混在パターン A: Width のみ完全名で受理する", () => {
  // 先頭キー Width が完全名、残りは略号でも InlineImageDict.normalize 展開で通る
  const token = buildInlineImageToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("H", integerToken(1)),
    buildEntry("BPC", integerToken(8)),
    buildEntry("CS", nameToken("G")),
  ]);
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
});

test("混在パターン B: Width のみ略号で受理する", () => {
  // 先頭キー W が略号、残りは完全名でも展開後に揃って通る
  const token = buildInlineImageToken([
    buildEntry("W", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
});

test("混在パターン C: 前半完全名・後半略号で受理する", () => {
  // 前半 Width/Height が完全名、後半 BPC/CS が略号でも通る
  const token = buildInlineImageToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BPC", integerToken(8)),
    buildEntry("CS", nameToken("G")),
  ]);
  const context = buildContext();

  const result = inlineImageHandler(context, token);

  assert(result.ok);
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

test("成功時に operand stack の depth が変わらない", () => {
  // InlineImage は operand を取らないため、事前に積んだ stack も影響を受けない
  const context = buildContext();
  OperandStack.push(context.operandStack, { type: "integer", value: 99 });
  const before = OperandStack.depth(context.operandStack);

  const token = buildInlineImageToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);
  const result = inlineImageHandler(context, token);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(before);
});

test("成功時に graphics state stack の current が同一参照", () => {
  // graphics state は更新しないため current state も入力と同じ参照を返す
  const context = buildContext();
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const token = buildInlineImageToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);
  const result = inlineImageHandler(context, token);

  assert(result.ok);
  expect(GraphicsStateStack.current(result.value.graphicsStateStack)).toBe(
    before,
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
