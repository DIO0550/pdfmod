import type { PdfParseError } from "../../errors/index.js";
import {
  isPdfTokenBoundary,
  skipWhitespaceAndComments,
} from "../../lexer/pdf-bytes.js";
import { Tokenizer } from "../../lexer/tokenizer.js";
import type { Result } from "../../result/index.js";
import { err, ok } from "../../result/index.js";
import type {
  ByteOffset,
  PdfObject,
  Token,
  TrailerDict,
} from "../../types/index.js";
import { TokenType } from "../../types/index.js";

// --- バイト定数 (SCREAMING_SNAKE_CASE) ---

const TRAILER_BYTES = Array.from(new TextEncoder().encode("trailer"));
const TRAILER_KEYWORD_LENGTH = 7;
const MAX_NESTING_DEPTH = 64;

// --- エラーヘルパー ---

/**
 * trailer パース失敗時のエラー Result を生成するヘルパー。
 *
 * @param message - エラーメッセージ
 * @param offset - 問題が検出されたバイトオフセット
 * @returns `Err<PdfParseError>` (コード: XREF_TABLE_INVALID)
 */
function failTrailer(
  message: string,
  offset?: number,
): Result<TrailerDict, PdfParseError> {
  return err({ code: "XREF_TABLE_INVALID", message, offset });
}

// --- 内部ヘルパー ---

/**
 * data の指定位置でバイト列が一致するか判定する。
 *
 * @param data - 検索対象のバイト配列
 * @param offset - 比較開始位置
 * @param pattern - 一致判定するバイト列
 * @returns 一致すれば `true`
 */
function matchesBytesAt(
  data: Uint8Array,
  offset: number,
  pattern: number[],
): boolean {
  if (offset + pattern.length > data.length) {
    return false;
  }
  for (let j = 0; j < pattern.length; j++) {
    if (data[offset + j] !== pattern[j]) {
      return false;
    }
  }
  return true;
}

/**
 * hex 文字列を Uint8Array に変換する。奇数長の場合は末尾に 0 をパディングする。
 *
 * @param hex - 16進文字列
 * @returns 変換されたバイト配列
 */
function hexStringToBytes(hex: string): Uint8Array {
  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * リテラル文字列の各文字をバイト値として Uint8Array に変換する。
 *
 * @param str - リテラル文字列
 * @returns 変換されたバイト配列
 */
function literalStringToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

/**
 * ネスト深さ超過時のエラー Result を生成するヘルパー。
 *
 * @param offset - 問題が検出されたバイトオフセット
 * @returns `Err<PdfParseError>` (コード: NESTING_TOO_DEEP)
 */
function failNestingTooDeep(offset: number): Result<never, PdfParseError> {
  return err({
    code: "NESTING_TOO_DEEP",
    message: "nesting depth exceeds maximum allowed limit",
    offset,
  });
}

/**
 * ネストされた配列 `[` ... `]` のトークンを再帰的に消費して読み飛ばす。
 *
 * @param tokens - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用のベースオフセット
 * @param depth - 現在のネスト深さ
 * @returns 成功時は `Ok<void>`、失敗時は `Err<PdfParseError>`
 */
function skipNestedArray(
  tokens: BufferedTokenizer,
  baseOffset: number,
  depth = 0,
): Result<void, PdfParseError> {
  if (depth >= MAX_NESTING_DEPTH) {
    return failNestingTooDeep(baseOffset);
  }
  while (true) {
    const token = tokens.next();
    if (token.type === TokenType.ArrayEnd) {
      return ok(undefined);
    }
    if (token.type === TokenType.EOF) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "unexpected end of data while skipping value",
        offset: baseOffset + token.offset,
      });
    }
    if (token.type === TokenType.ArrayBegin) {
      const r = skipNestedArray(tokens, baseOffset, depth + 1);
      if (!r.ok) {
        return r;
      }
    } else if (token.type === TokenType.DictBegin) {
      const r = skipNestedDict(tokens, baseOffset, depth + 1);
      if (!r.ok) {
        return r;
      }
    }
  }
}

/**
 * ネストされた辞書 `<<` ... `>>` のトークンを再帰的に消費して読み飛ばす。
 *
 * @param tokens - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用のベースオフセット
 * @param depth - 現在のネスト深さ
 * @returns 成功時は `Ok<void>`、失敗時は `Err<PdfParseError>`
 */
function skipNestedDict(
  tokens: BufferedTokenizer,
  baseOffset: number,
  depth = 0,
): Result<void, PdfParseError> {
  if (depth >= MAX_NESTING_DEPTH) {
    return failNestingTooDeep(baseOffset);
  }
  while (true) {
    const token = tokens.next();
    if (token.type === TokenType.DictEnd) {
      return ok(undefined);
    }
    if (token.type === TokenType.EOF) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "unexpected end of data while skipping value",
        offset: baseOffset + token.offset,
      });
    }
    if (token.type === TokenType.ArrayBegin) {
      const r = skipNestedArray(tokens, baseOffset, depth + 1);
      if (!r.ok) {
        return r;
      }
    } else if (token.type === TokenType.DictBegin) {
      const r = skipNestedDict(tokens, baseOffset, depth + 1);
      if (!r.ok) {
        return r;
      }
    }
  }
}

/** 辞書エントリの値と、その値の開始バイトオフセットを保持する。 */
interface DictEntry {
  value: PdfObject;
  offset: number;
}

/** Tokenizer にトークンの push-back 機能を付加するラッパー。間接参照の先読みに使用する。 */
class BufferedTokenizer {
  private tokenizer: Tokenizer;
  private buffer: Token[] = [];

  /**
   * @param tokenizer - ラップ対象の Tokenizer
   */
  constructor(tokenizer: Tokenizer) {
    this.tokenizer = tokenizer;
  }

  /**
   * 次のトークンを返す。バッファにトークンがあればそちらを優先する。
   *
   * @returns 次のトークン
   */
  next(): Token {
    const buffered = this.buffer.pop();
    if (buffered) {
      return buffered;
    }
    return this.tokenizer.nextToken();
  }

  /**
   * トークンをバッファに戻し、次回の next() で再取得できるようにする。
   *
   * @param token - 戻すトークン
   */
  pushBack(token: Token): void {
    this.buffer.push(token);
  }
}

/**
 * トークンから PdfObject を読み取る。Integer の場合は間接参照 (Int Int R) を先読み判定する。
 *
 * @param firstToken - 読み取り済みの先頭トークン
 * @param tokens - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用のベースオフセット
 * @param depth - 現在のネスト深さ
 * @returns 成功時は `Ok<DictEntry>`、失敗時は `Err<PdfParseError>`
 */
function readValue(
  firstToken: Token,
  tokens: BufferedTokenizer,
  baseOffset: number,
  depth = 0,
): Result<DictEntry, PdfParseError> {
  const offset = baseOffset + firstToken.offset;

  switch (firstToken.type) {
    case TokenType.Integer: {
      const second = tokens.next();
      if (second.type === TokenType.Integer) {
        const third = tokens.next();
        if (third.type === TokenType.Keyword && third.value === "R") {
          return ok({
            value: {
              type: "indirect-ref",
              objectNumber: firstToken.value as number,
              generationNumber: second.value as number,
            },
            offset,
          });
        }
        tokens.pushBack(third);
      }
      tokens.pushBack(second);
      return ok({
        value: { type: "integer", value: firstToken.value as number },
        offset,
      });
    }
    case TokenType.Real:
      return ok({
        value: { type: "real", value: firstToken.value as number },
        offset,
      });
    case TokenType.Name:
      return ok({
        value: { type: "name", value: firstToken.value as string },
        offset,
      });
    case TokenType.HexString:
      return ok({
        value: {
          type: "string",
          value: hexStringToBytes(firstToken.value as string),
          encoding: "hex" as const,
        },
        offset,
      });
    case TokenType.LiteralString:
      return ok({
        value: {
          type: "string",
          value: literalStringToBytes(firstToken.value as string),
          encoding: "literal" as const,
        },
        offset,
      });
    case TokenType.Boolean:
      return ok({
        value: { type: "boolean", value: firstToken.value as boolean },
        offset,
      });
    case TokenType.Null:
      return ok({ value: { type: "null" }, offset });
    case TokenType.ArrayBegin: {
      if (depth >= MAX_NESTING_DEPTH) {
        return failNestingTooDeep(offset);
      }
      const elements = readArrayElements(tokens, baseOffset, depth + 1);
      if (!elements.ok) {
        return elements;
      }
      return ok({
        value: { type: "array", elements: elements.value },
        offset,
      });
    }
    case TokenType.DictBegin: {
      if (depth >= MAX_NESTING_DEPTH) {
        return failNestingTooDeep(offset);
      }
      const r = skipNestedDict(tokens, baseOffset, depth + 1);
      if (!r.ok) {
        return r;
      }
      return ok({ value: { type: "null" }, offset });
    }
    default:
      return ok({ value: { type: "null" }, offset });
  }
}

/**
 * `[` 直後から `]` までの配列要素を読み取り PdfObject 配列として返す。
 *
 * @param tokens - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用のベースオフセット
 * @param depth - 現在のネスト深さ
 * @returns 成功時は `Ok<PdfObject[]>`、失敗時は `Err<PdfParseError>`
 */
function readArrayElements(
  tokens: BufferedTokenizer,
  baseOffset: number,
  depth = 0,
): Result<PdfObject[], PdfParseError> {
  const elements: PdfObject[] = [];
  while (true) {
    const token = tokens.next();
    if (token.type === TokenType.ArrayEnd) {
      return ok(elements);
    }
    if (token.type === TokenType.EOF) {
      return err({
        code: "XREF_TABLE_INVALID",
        message:
          "unexpected end of data while parsing array in trailer dictionary",
        offset: baseOffset + token.offset,
      });
    }
    const elemResult = readValue(token, tokens, baseOffset, depth);
    if (!elemResult.ok) {
      return elemResult;
    }
    elements.push(elemResult.value.value);
  }
}

/**
 * `<<` ... `>>` 間のトークンを走査し、キーと値のエントリマップを構築する。
 *
 * @param tokens - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用のベースオフセット
 * @returns 成功時は `Ok<Map<string, DictEntry>>`、失敗時は `Err<PdfParseError>`
 */
function parseDictTokens(
  tokens: BufferedTokenizer,
  baseOffset: number,
): Result<Map<string, DictEntry>, PdfParseError> {
  const beginToken = tokens.next();
  if (beginToken.type !== TokenType.DictBegin) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "expected dictionary start (<<) after trailer keyword",
      offset: baseOffset + beginToken.offset,
    });
  }

  const entries = new Map<string, DictEntry>();

  while (true) {
    const token = tokens.next();

    if (token.type === TokenType.DictEnd) {
      return ok(entries);
    }

    if (token.type === TokenType.EOF) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "unexpected end of data while parsing trailer dictionary",
        offset: baseOffset + token.offset,
      });
    }

    if (token.type !== TokenType.Name) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "expected name key in trailer dictionary",
        offset: baseOffset + token.offset,
      });
    }

    const key = token.value as string;
    const valueToken = tokens.next();

    if (valueToken.type === TokenType.EOF) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "unexpected end of data while parsing trailer dictionary",
        offset: baseOffset + valueToken.offset,
      });
    }

    if (valueToken.type === TokenType.DictEnd) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "expected value for key in trailer dictionary",
        offset: baseOffset + valueToken.offset,
      });
    }

    const valueResult = readValue(valueToken, tokens, baseOffset);
    if (!valueResult.ok) {
      return valueResult;
    }
    entries.set(key, valueResult.value);
  }
}

/**
 * 辞書エントリから必須・オプションキーを検証・抽出し TrailerDict を構築する。
 *
 * @param entries - parseDictTokens で構築された辞書エントリマップ
 * @returns 成功時は `Ok<TrailerDict>`、失敗時は `Err<PdfParseError>`
 */
function buildTrailerDict(
  entries: Map<string, DictEntry>,
): Result<TrailerDict, PdfParseError> {
  // /Root - required, must be IndirectRef
  const rootEntry = entries.get("Root");
  if (!rootEntry) {
    return err({
      code: "ROOT_NOT_FOUND",
      message: "/Root entry is missing in trailer dictionary",
    });
  }
  if (
    rootEntry.value.type !== "indirect-ref" ||
    rootEntry.value.objectNumber < 0 ||
    rootEntry.value.generationNumber < 0
  ) {
    return err({
      code: "ROOT_NOT_FOUND",
      message: "/Root entry is not an indirect reference",
      offset: rootEntry.offset,
    });
  }
  const root = {
    objectNumber: rootEntry.value.objectNumber,
    generationNumber: rootEntry.value.generationNumber,
  };

  // /Size - required, must be non-negative integer
  const sizeEntry = entries.get("Size");
  if (!sizeEntry) {
    return err({
      code: "SIZE_NOT_FOUND",
      message: "/Size entry is missing in trailer dictionary",
    });
  }
  if (
    sizeEntry.value.type !== "integer" ||
    (sizeEntry.value.value as number) < 0
  ) {
    return err({
      code: "SIZE_NOT_FOUND",
      message: "/Size entry is not a non-negative integer",
      offset: sizeEntry.offset,
    });
  }
  const size = sizeEntry.value.value as number;

  const result: TrailerDict = { root, size };

  // /Prev - optional, non-negative integer
  const prevEntry = entries.get("Prev");
  if (prevEntry) {
    if (
      prevEntry.value.type !== "integer" ||
      (prevEntry.value.value as number) < 0
    ) {
      return failTrailer(
        "/Prev entry is not a non-negative integer",
        prevEntry.offset,
      );
    }
    result.prev = prevEntry.value.value as number;
  }

  // /Info - optional, IndirectRef
  const infoEntry = entries.get("Info");
  if (infoEntry) {
    if (
      infoEntry.value.type !== "indirect-ref" ||
      infoEntry.value.objectNumber < 0 ||
      infoEntry.value.generationNumber < 0
    ) {
      return failTrailer(
        "/Info entry is not an indirect reference",
        infoEntry.offset,
      );
    }
    result.info = {
      objectNumber: infoEntry.value.objectNumber,
      generationNumber: infoEntry.value.generationNumber,
    };
  }

  // /ID - optional, must be 2-element array of string objects
  const idEntry = entries.get("ID");
  if (idEntry) {
    if (idEntry.value.type !== "array") {
      return failTrailer(
        "/ID entry must be a 2-element array of strings",
        idEntry.offset,
      );
    }
    const elements = idEntry.value.elements;
    if (elements.length !== 2) {
      return failTrailer(
        "/ID entry must be a 2-element array of strings",
        idEntry.offset,
      );
    }
    const idPair: [Uint8Array, Uint8Array] = [
      new Uint8Array(0),
      new Uint8Array(0),
    ];
    for (let i = 0; i < 2; i++) {
      const elem = elements[i];
      if (elem.type !== "string") {
        return failTrailer(
          "/ID entry must be a 2-element array of strings",
          idEntry.offset,
        );
      }
      idPair[i] = elem.value;
    }
    result.id = idPair;
  }

  return ok(result);
}

/**
 * trailer キーワード位置から辞書を解析し TrailerDict を構築する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param offset - trailer キーワードの開始バイトオフセット
 * @returns TrailerDict または PdfParseError
 */
export function parseTrailer(
  data: Uint8Array,
  offset: ByteOffset,
): Result<TrailerDict, PdfParseError> {
  // 入力境界検証
  if (offset < 0 || offset >= data.length) {
    return failTrailer("trailer offset out of bounds", offset);
  }

  // trailer キーワード検証
  if (!matchesBytesAt(data, offset, TRAILER_BYTES)) {
    return failTrailer(`trailer keyword not found at offset ${offset}`, offset);
  }

  // 前方境界チェック
  if (offset > 0 && !isPdfTokenBoundary(data[offset - 1])) {
    return failTrailer(`trailer keyword not found at offset ${offset}`, offset);
  }

  // 後方境界チェック
  const afterTrailer = offset + TRAILER_KEYWORD_LENGTH;
  if (afterTrailer < data.length && !isPdfTokenBoundary(data[afterTrailer])) {
    return failTrailer(`trailer keyword not found at offset ${offset}`, offset);
  }

  // 空白スキップ + Tokenizer 初期化
  const dictStart = skipWhitespaceAndComments(data, afterTrailer);
  const subData = data.subarray(dictStart);
  const tokens = new BufferedTokenizer(new Tokenizer(subData));
  const baseOffset = dictStart;

  // 辞書パース
  const dictResult = parseDictTokens(tokens, baseOffset);
  if (!dictResult.ok) {
    return dictResult;
  }

  // TrailerDict 構築
  return buildTrailerDict(dictResult.value);
}
