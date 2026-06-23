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

const booleanToken = (value: boolean): Token => ({
  type: TokenType.Boolean,
  value,
  offset: ByteOffset.of(0),
});

const nameToken = (value: string): Token => ({
  type: TokenType.Name,
  value,
  offset: ByteOffset.of(0),
});

const buildToken = (
  entries: ReadonlyArray<TokenInlineImageDictEntry>,
): TokenInlineImage => ({
  type: TokenType.InlineImage,
  dict: entries,
  data: new Uint8Array([]),
  offset: ByteOffset.of(0),
});

const buildContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
});

const dimensions = (): TokenInlineImageDictEntry[] => [
  buildEntry("Width", integerToken(1)),
  buildEntry("Height", integerToken(1)),
  buildEntry("BitsPerComponent", integerToken(1)),
];

test("/ImageMask true + ColorSpace なしで成功する（stencil mask 例外）", () => {
  // PDF §8.9.6 で ImageMask=true のとき ColorSpace は不要
  const token = buildToken([
    ...dimensions(),
    buildEntry("ImageMask", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/ImageMask true + BitsPerComponent なしで成功する", () => {
  // ISO 32000-1:2008 §8.9.5 Table 89: stencil mask では BPC も optional (default 1)
  const token = buildToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("ImageMask", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/IM true（略号）+ BitsPerComponent なし + ColorSpace なしで成功する", () => {
  // stencil mask の最小構成: Width / Height / IM true のみで通る
  const token = buildToken([
    buildEntry("Width", integerToken(8)),
    buildEntry("Height", integerToken(8)),
    buildEntry("IM", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/IM true（略号）+ ColorSpace なしで成功する", () => {
  // normalizer が /IM → /ImageMask に展開するため stencil mask 例外が成立
  const token = buildToken([
    ...dimensions(),
    buildEntry("IM", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/ImageMask true でも ColorSpace を持つ dict を受理する", () => {
  // 冗長な ColorSpace を含んでも検査は素通り（仕様外でも受理）
  const token = buildToken([
    ...dimensions(),
    buildEntry("ImageMask", booleanToken(true)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/ImageMask false + ColorSpace なしで ColorSpace 欠落の err を返す", () => {
  // 明示的に false の場合は通常の必須キー集合（ColorSpace 必須）に戻る
  const token = buildToken([
    ...dimensions(),
    buildEntry("ImageMask", booleanToken(false)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("ColorSpace");
});

test("/ImageMask が非 Boolean (Name) のとき ColorSpace 欠落で err を返す", () => {
  // 不正型は false 扱い → ColorSpace 必須に戻る
  const token = buildToken([
    ...dimensions(),
    buildEntry("ImageMask", nameToken("true")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("ColorSpace");
});

test("/ImageMask が Boolean(false) のとき ColorSpace 必須に戻る", () => {
  // value === true の厳密判定なので false でも当然 ColorSpace 必須
  const token = buildToken([
    ...dimensions(),
    buildEntry("ImageMask", booleanToken(false)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});

test("/ImageMask true でも Width 欠落のときは Width を返す", () => {
  // stencil mask 例外は ColorSpace のみをスキップする。他キーは依然必須
  const token = buildToken([
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(1)),
    buildEntry("ImageMask", booleanToken(true)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("Width");
});

test("/ImageMask entry の value が空配列のとき false 扱いになり ColorSpace 必須", () => {
  // isImageMaskTrue の undefined ガードを pin down
  const token = buildToken([
    ...dimensions(),
    {
      key: {
        type: TokenType.Name,
        value: "ImageMask",
        offset: ByteOffset.of(0),
      },
      value: [],
    },
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("ColorSpace");
});

test("/ImageMask true と /ImageMask false 重複時は最初の true を採用する", () => {
  // Array.find のセマンティクスを pin down: 仕様外 PDF への防御
  const token = buildToken([
    ...dimensions(),
    buildEntry("ImageMask", booleanToken(true)),
    buildEntry("ImageMask", booleanToken(false)),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(result.ok);
});
