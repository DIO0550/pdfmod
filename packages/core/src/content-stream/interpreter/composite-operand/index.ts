import type {
  PdfArray,
  PdfDictionary,
  PdfError,
  PdfValue,
  TokenArrayBegin,
  TokenDictBegin,
} from "../../../pdf/index";
import { Token, TokenType, tokenDisplayString } from "../../../pdf/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { ContentStreamTokenizer } from "../../tokenizer/index";

/**
 * 配列・辞書リテラルのネスト上限。direct-object reader と同値。
 * 悪意ある content stream による stack overflow を防ぐ defensive design。
 * array/dict が相互再帰で共有する単一定数。
 */
const MAX_NESTING_DEPTH = 100;

/**
 * content stream の配列リテラル `[ ... ]` を PdfArray として組み立てる。
 *
 * 呼び出し前に `ArrayBegin` token は既に消費済みであること。
 * 内部で `tokenizer.nextToken()` を `ArrayEnd` まで回し、
 * ネスト配列・辞書は相互再帰で処理する。要素は primitive / PdfArray / PdfDictionary のみ。
 * primitive token に変換できない token（Operator / InlineImage / Keyword / 不正 delimiter 等）は
 * `OBJECT_PARSE_UNEXPECTED_TOKEN` で拒否する。
 *
 * @param tokenizer - `ArrayBegin` 消費済みの content stream tokenizer
 * @param openToken - `ArrayBegin` token（エラー位置報告用、型レベルで `[` のみ受理）
 * @returns PdfArray、または OBJECT_PARSE_UNTERMINATED / OBJECT_PARSE_UNEXPECTED_TOKEN / NESTING_TOO_DEEP
 */
export function readArrayOperand(
  tokenizer: ContentStreamTokenizer,
  openToken: TokenArrayBegin,
): Result<PdfArray, PdfError> {
  return readArrayInner(tokenizer, openToken, 1);
}

/**
 * content stream の辞書リテラル `<< ... >>` を PdfDictionary として組み立てる。
 *
 * 呼び出し前に `DictBegin` token は既に消費済みであること。
 * 内部で `tokenizer.nextToken()` を `DictEnd` まで回し、
 * key / value pair を `Map<string, PdfValue>` に格納する。
 * key 位置は `Name` のみ受理、value 位置は primitive / PdfArray / PdfDictionary を受理する。
 * 同一 key は後勝ち（`Map.set` の上書き挙動）。
 *
 * @param tokenizer - `DictBegin` 消費済みの content stream tokenizer
 * @param openToken - `DictBegin` token（エラー位置報告用、型レベルで `<<` のみ受理）
 * @returns PdfDictionary、または OBJECT_PARSE_UNTERMINATED / OBJECT_PARSE_UNEXPECTED_TOKEN / NESTING_TOO_DEEP
 */
export function readDictOperand(
  tokenizer: ContentStreamTokenizer,
  openToken: TokenDictBegin,
): Result<PdfDictionary, PdfError> {
  return readDictInner(tokenizer, openToken, 1);
}

function readArrayInner(
  tokenizer: ContentStreamTokenizer,
  openToken: TokenArrayBegin,
  depth: number,
): Result<PdfArray, PdfError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Array nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: openToken.offset,
    });
  }

  const elements: PdfValue[] = [];

  while (true) {
    const tokenResult = tokenizer.nextToken();
    if (!tokenResult.ok) {
      return err(tokenResult.error);
    }
    const token = tokenResult.value;

    if (token.type === TokenType.ArrayEnd) {
      return ok({ type: "array", elements });
    }

    if (token.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated array operand",
        offset: openToken.offset,
      });
    }

    if (token.type === TokenType.ArrayBegin) {
      const nested = readArrayInner(tokenizer, token, depth + 1);
      if (!nested.ok) {
        return err(nested.error);
      }
      elements.push(nested.value);
      continue;
    }

    if (token.type === TokenType.DictBegin) {
      const nested = readDictInner(tokenizer, token, depth + 1);
      if (!nested.ok) {
        return err(nested.error);
      }
      elements.push(nested.value);
      continue;
    }

    const objectResult = Token.toPrimitivePdfValue(token);
    if (!objectResult.ok) {
      return err(objectResult.error);
    }
    if (!objectResult.value.some) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Unexpected token in array operand: ${tokenDisplayString(token)}`,
        offset: token.offset,
      });
    }

    elements.push(objectResult.value.value);
  }
}

function readDictInner(
  tokenizer: ContentStreamTokenizer,
  openToken: TokenDictBegin,
  depth: number,
): Result<PdfDictionary, PdfError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Dictionary nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: openToken.offset,
    });
  }

  const entries = new Map<string, PdfValue>();

  while (true) {
    const keyResult = tokenizer.nextToken();
    if (!keyResult.ok) {
      return err(keyResult.error);
    }
    const keyToken = keyResult.value;

    if (keyToken.type === TokenType.DictEnd) {
      return ok({ type: "dictionary", entries });
    }

    if (keyToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated dictionary operand",
        offset: openToken.offset,
      });
    }

    if (keyToken.type !== TokenType.Name) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Dictionary key must be a name, got ${tokenDisplayString(keyToken)}`,
        offset: keyToken.offset,
      });
    }

    const valueResult = tokenizer.nextToken();
    if (!valueResult.ok) {
      return err(valueResult.error);
    }
    const valueToken = valueResult.value;

    if (valueToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated dictionary operand",
        offset: openToken.offset,
      });
    }

    if (valueToken.type === TokenType.ArrayBegin) {
      const nested = readArrayInner(tokenizer, valueToken, depth + 1);
      if (!nested.ok) {
        return err(nested.error);
      }
      entries.set(keyToken.value, nested.value);
      continue;
    }

    if (valueToken.type === TokenType.DictBegin) {
      const nested = readDictInner(tokenizer, valueToken, depth + 1);
      if (!nested.ok) {
        return err(nested.error);
      }
      entries.set(keyToken.value, nested.value);
      continue;
    }

    const primitive = Token.toPrimitivePdfValue(valueToken);
    if (!primitive.ok) {
      return err(primitive.error);
    }
    if (!primitive.value.some) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Unexpected token in dictionary value: ${tokenDisplayString(valueToken)}`,
        offset: valueToken.offset,
      });
    }

    entries.set(keyToken.value, primitive.value.value);
  }
}
