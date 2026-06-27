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

const booleanToken = (value: boolean): Token => ({
  type: TokenType.Boolean,
  value,
  offset: ByteOffset.of(0),
});

const buildToken = (entries: InlineImageDict): TokenInlineImage => ({
  type: TokenType.InlineImage,
  dict: entries,
  data: new Uint8Array([]),
  offset: ByteOffset.of(0),
});

const buildContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
});

test("/ImageMask true + ColorSpace なしで成功する（stencil mask 例外の統合）", () => {
  // dict.normalize → dict.isImageMaskTrue → dict.findMissingRequiredKey の合流経路を最小ケースで pin down
  const token = buildToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("ImageMask", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/ImageMask false + ColorSpace なしで ColorSpace 欠落の err を返す（通常画像経路）", () => {
  // imageMask=false に倒れて 4 必須キー集合に戻ることを統合経路で pin down。
  // missingKey も明示的に検査し、handler の欠落キー判定が ColorSpace に倒れることをリグレッション検出可能にする。
  const token = buildToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(1)),
    buildEntry("ImageMask", booleanToken(false)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("ColorSpace");
});

test("/IM true + /W /H の略号 dict で stencil mask 例外が成立する（略号→normalize→isImageMaskTrue→findMissingRequiredKey の完全鎖）", () => {
  // 略号入力が dict コンパニオン経由で完全鎖を辿り stencil mask 経路へ合流することを 1 件で pin down
  const token = buildToken([
    buildEntry("W", integerToken(8)),
    buildEntry("H", integerToken(8)),
    buildEntry("IM", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});
