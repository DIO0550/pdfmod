import type {
  PdfArray,
  PdfDictionary,
  PdfError,
  PdfValue,
  TokenArrayBegin,
  TokenDictBegin,
  TokenName,
} from "../../../pdf/index";
import { Token, TokenType, tokenDisplayString } from "../../../pdf/index";
import type { Option } from "../../../utils/option/index";
import { none, some } from "../../../utils/option/index";
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

/**
 * 配列リテラルの本体ループ。`readArrayOperand` から depth=1 で呼び出される他、
 * `readDictInner` / 自分自身から `depth + 1` で再帰呼び出しされる。
 *
 * @param tokenizer - `ArrayBegin` 消費済みの content stream tokenizer
 * @param openToken - `ArrayBegin` token（エラー位置報告用）
 * @param depth - 現在のネスト深度（先頭呼び出しは 1）
 * @returns PdfArray、または OBJECT_PARSE_UNTERMINATED / OBJECT_PARSE_UNEXPECTED_TOKEN / NESTING_TOO_DEEP
 */
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

/**
 * 辞書リテラルの本体ループ。`readDictOperand` から depth=1 で呼び出される他、
 * `readDictValue` / `readArrayInner` から `depth + 1` で再帰呼び出しされる。
 *
 * while 本体は `readDictKey` → `readDictValue` → `entries.set` の 3 ステップに圧縮されており、
 * key/value 各位置のパース責務はヘルパに委譲する。
 *
 * @param tokenizer - `DictBegin` 消費済みの content stream tokenizer
 * @param openToken - `DictBegin` token（エラー位置報告用）
 * @param depth - 現在のネスト深度（先頭呼び出しは 1）
 * @returns PdfDictionary、または OBJECT_PARSE_UNTERMINATED / OBJECT_PARSE_UNEXPECTED_TOKEN / NESTING_TOO_DEEP
 */
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
    const keyResult = readDictKey(tokenizer, openToken);
    if (!keyResult.ok) {
      return err(keyResult.error);
    }
    if (!keyResult.value.some) {
      return ok({ type: "dictionary", entries });
    }
    const keyToken = keyResult.value.value;

    const valueResult = readDictValue(tokenizer, openToken, depth);
    if (!valueResult.ok) {
      return err(valueResult.error);
    }

    entries.set(keyToken.value, valueResult.value);
  }
}

/**
 * 辞書の key 位置から 1 token 読み取り、ループ終了 / key / エラーの 3 状態を返す。
 *
 * `Result<Option<TokenName>, PdfError>` の三状態:
 * - `ok(some(token))`: 正常な key トークン（`TokenName` へ narrowing 済み）
 * - `ok(none)`: `DictEnd` を観測。`readDictInner` のループ終了サイン
 * - `err(...)`: tokenizer 自体のエラー / EOF / Name 以外の token
 *
 * EOF は openToken.offset を、key 位置の不正は keyToken.offset を返す。
 *
 * @param tokenizer - `DictBegin` 消費済みの content stream tokenizer
 * @param openToken - `DictBegin` token（OBJECT_PARSE_UNTERMINATED の offset 報告用）
 * @returns 正常 key / 終了サイン / エラーの三状態
 */
function readDictKey(
  tokenizer: ContentStreamTokenizer,
  openToken: TokenDictBegin,
): Result<Option<TokenName>, PdfError> {
  const tokenResult = tokenizer.nextToken();
  if (!tokenResult.ok) {
    return err(tokenResult.error);
  }
  const keyToken = tokenResult.value;

  if (keyToken.type === TokenType.DictEnd) {
    return ok(none);
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

  return ok(some(keyToken));
}

/**
 * 辞書の value 位置から 1 token 読み取り、対応する `PdfValue` を返す。
 *
 * value 位置の分岐:
 * - `EOF`        → `err(OBJECT_PARSE_UNTERMINATED, openToken.offset)`
 * - `ArrayBegin` → `readArrayInner(tokenizer, token, depth + 1)` へ相互再帰
 * - `DictBegin`  → `readDictInner(tokenizer, token, depth + 1)` へ自己再帰
 * - その他       → `Token.toPrimitivePdfValue(token)` を呼び、
 *                  `ok(none)` の場合は `err(OBJECT_PARSE_UNEXPECTED_TOKEN, token.offset)`
 *
 * tokenizer 自体のエラーは透過。`OBJECT_PARSE_UNEXPECTED_TOKEN` の offset は
 * 該当 valueToken.offset を維持する。
 *
 * @param tokenizer - `DictBegin` 消費済みの content stream tokenizer
 * @param openToken - `DictBegin` token（OBJECT_PARSE_UNTERMINATED の offset 報告用）
 * @param depth - 現在のネスト深度。ネスト再帰では depth + 1 を渡す
 * @returns PdfValue、または OBJECT_PARSE_UNTERMINATED / OBJECT_PARSE_UNEXPECTED_TOKEN / NESTING_TOO_DEEP
 */
function readDictValue(
  tokenizer: ContentStreamTokenizer,
  openToken: TokenDictBegin,
  depth: number,
): Result<PdfValue, PdfError> {
  const tokenResult = tokenizer.nextToken();
  if (!tokenResult.ok) {
    return err(tokenResult.error);
  }
  const valueToken = tokenResult.value;

  if (valueToken.type === TokenType.EOF) {
    return err({
      code: "OBJECT_PARSE_UNTERMINATED",
      message: "Unterminated dictionary operand",
      offset: openToken.offset,
    });
  }

  if (valueToken.type === TokenType.ArrayBegin) {
    return readArrayInner(tokenizer, valueToken, depth + 1);
  }

  if (valueToken.type === TokenType.DictBegin) {
    return readDictInner(tokenizer, valueToken, depth + 1);
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

  return ok(primitive.value.value);
}
