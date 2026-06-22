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

const buildToken = (
  entries: ReadonlyArray<TokenInlineImageDictEntry>,
): TokenInlineImage => ({
  type: TokenType.InlineImage,
  dict: entries,
  data: new Uint8Array([]),
  offset: TOKEN_OFFSET,
});

const buildContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
});

const fullEntries = (): TokenInlineImageDictEntry[] => [
  buildEntry("Width", integerToken(1)),
  buildEntry("Height", integerToken(1)),
  buildEntry("BitsPerComponent", integerToken(8)),
  buildEntry("ColorSpace", nameToken("DeviceGray")),
];

test.each<["Width" | "Height" | "BitsPerComponent" | "ColorSpace"]>([
  ["Width"],
  ["Height"],
  ["BitsPerComponent"],
  ["ColorSpace"],
])("%s 欠落で INLINE_IMAGE_REQUIRED_KEY_MISSING を返す", (missingKey) => {
  // 必須キー 4 種それぞれの単独欠落で対応する missingKey を持つ err が返る
  const entries = fullEntries().filter((e) => e.key.value !== missingKey);
  const token = buildToken(entries);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  expect(result.error.code).toBe("INLINE_IMAGE_REQUIRED_KEY_MISSING");
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe(missingKey);
  expect(result.error.offset).toBe(TOKEN_OFFSET);
  expect(result.error.message).toContain(`'${missingKey}'`);
});

test("Width と Height の両方が欠落のとき最初に発見された Width を返す", () => {
  // 検査順序は Width → Height → BitsPerComponent → ColorSpace。Width が先に検出される
  const token = buildToken([
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("Width");
});

test("Height のみ欠落で Height を返す", () => {
  // 検査順序の 2 番目で初めて欠落するケース
  const token = buildToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("Height");
});

test("BitsPerComponent のみ欠落で BitsPerComponent を返す", () => {
  // 検査順序の 3 番目で初めて欠落するケース
  const token = buildToken([
    buildEntry("Width", integerToken(1)),
    buildEntry("Height", integerToken(1)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.missingKey).toBe("BitsPerComponent");
});

test("エラーの offset は token.offset と一致する", () => {
  // offset 伝搬: handler は token の開始位置をそのまま err に載せる
  const token = buildToken([
    buildEntry("Height", integerToken(1)),
    buildEntry("BitsPerComponent", integerToken(8)),
    buildEntry("ColorSpace", nameToken("DeviceGray")),
  ]);

  const result = inlineImageHandler(buildContext(), token);

  assert(!result.ok);
  expect(result.error.code).toBe("INLINE_IMAGE_REQUIRED_KEY_MISSING");
  assert(result.error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING");
  expect(result.error.offset).toBe(TOKEN_OFFSET);
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
  if (error.code === "INLINE_IMAGE_REQUIRED_KEY_MISSING") {
    const narrowed: PdfInlineImageRequiredKeyMissingError = error;
    expect(narrowed.missingKey).toBe("Width");
  } else {
    throw new Error("expected INLINE_IMAGE_REQUIRED_KEY_MISSING error code");
  }
});
