import { assert, expect, test } from "vitest";
import type {
  PdfError,
  PdfInlineImageRequiredKeyMissingError,
} from "../../../../pdf/errors/index";
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

const TOKEN_OFFSET = ByteOffset.of(42);

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

const buildToken = (entries: InlineImageDict): TokenInlineImage => ({
  type: TokenType.InlineImage,
  dict: entries,
  data: new Uint8Array([]),
  offset: TOKEN_OFFSET,
});

const buildContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
});

test("Width 欠落で err.code/missingKey/offset/message を載せる（err 生成と offset 伝搬の統合）", () => {
  // 必須キー欠落バリエーションの網羅は dict 側 required-keys.test.ts に移植済み。
  // ここでは handler 統合経路で err 生成・offset 伝搬・message 整形が動くことを 1 件 pin down する。
  const token = buildToken([
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("Width");
  expect(result.error.offset).toBe(TOKEN_OFFSET);
  expect(result.error.message).toContain("'Width'");
});

test("エラーは PdfInlineImageRequiredKeyMissingError として narrow できる", () => {
  // PdfError union から discriminant code で narrow できる構造を pin down
  const token = buildToken([
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  const error: PdfError = result.error;
  assert(error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  const narrowed: PdfInlineImageRequiredKeyMissingError = error;
  expect(narrowed.missingKey).toBe("Width");
});
