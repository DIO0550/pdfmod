import { expect, test } from "vitest";
import {
  ByteOffset,
  type Token,
  type TokenInlineImageDictEntry,
  TokenType,
} from "../../../../pdf/index";
import { InlineImageDict } from "../index";

const makeEntry = (
  key: string,
  value: ReadonlyArray<Token>,
): TokenInlineImageDictEntry => ({
  key: { type: TokenType.Name, value: key, offset: ByteOffset.of(0) },
  value,
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

const integerToken = (value: number): Token => ({
  type: TokenType.Integer,
  value,
  offset: ByteOffset.of(0),
});

test("/ImageMask Boolean(true) で true を返す", () => {
  // 完全名 /ImageMask + value[0]=Boolean(true) が stencil mask 判定の基本ケース
  const dict = [makeEntry("ImageMask", [booleanToken(true)])];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(true);
});

test("/ImageMask Boolean(false) で false を返す", () => {
  // 厳密 === true 判定のため false は当然 false
  const dict = [makeEntry("ImageMask", [booleanToken(false)])];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(false);
});

test("/ImageMask キーが存在しない dict で false を返す", () => {
  // /ImageMask 不在は通常画像経路に倒す
  const dict = [makeEntry("Width", [integerToken(1)])];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(false);
});

test("/ImageMask キーは存在するが value 配列が空のとき false を返す", () => {
  // value[0] === undefined ガードを pin down
  const dict = [makeEntry("ImageMask", [])];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(false);
});

test('/ImageMask の value[0] が Name("true") のとき false を返す', () => {
  // 型一致のみ true を許容する。文字列 "true" は Boolean ではない
  const dict = [makeEntry("ImageMask", [nameToken("true")])];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(false);
});

test("/ImageMask の value[0] が Integer(1) のとき false を返す", () => {
  // 型一致のみ true を許容する。数値 1 は Boolean ではない
  const dict = [makeEntry("ImageMask", [integerToken(1)])];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(false);
});

test("/ImageMask が複数あるとき最初の entry を採用する (true → false)", () => {
  // Array.find のセマンティクスを pin down: 仕様外 PDF への防御
  const dict = [
    makeEntry("ImageMask", [booleanToken(true)]),
    makeEntry("ImageMask", [booleanToken(false)]),
  ];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(true);
});

test("/ImageMask が複数あるとき最初の entry を採用する (false → true)", () => {
  // 最初が false なら以降に true があっても false で確定する
  const dict = [
    makeEntry("ImageMask", [booleanToken(false)]),
    makeEntry("ImageMask", [booleanToken(true)]),
  ];

  expect(InlineImageDict.isImageMaskTrue(dict)).toBe(false);
});
