import type { PdfParseError } from "../../../errors/index";
import type { Option } from "../../../option/index";
import { none, some } from "../../../option/index";
import type { Result } from "../../../result/index";
import { err, ok } from "../../../result/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import type { Token } from "../../../types/index";
import { TokenType } from "../../../types/index";
import { ObjectNumber } from "../../../types/object-number/index";
import type { PdfDictionary, PdfValue } from "../../../types/pdf-types/index";
import type { BufferedTokenizer } from "../buffered-tokenizer/index";
import { decodeHexString, decodeLiteralString } from "../string-decoder/index";

const MAX_NESTING_DEPTH = 100;

/**
 * direct object (stream を含まない PdfValue) を BufferedTokenizer からパースするコンパニオンオブジェクト。
 *
 * PDF 仕様 7.3.2-7.3.7, 7.3.9 の direct object、および 7.3.10 の indirect reference を扱う。
 */
export const DirectObject = {
  /**
   * BufferedTokenizer から direct object を1つパースする。
   *
   * @param bt - バッファ付きトークナイザ
   * @param baseOffset - 呼び出し元 data 基準の開始オフセット
   * @param depth - 現在のネスト深度
   * @returns PdfValue、またはエラー
   */
  parse(
    bt: BufferedTokenizer,
    baseOffset: ByteOffset,
    depth: number,
  ): Result<PdfValue, PdfParseError> {
    return readValue(bt, baseOffset, depth);
  },
} as const;

/**
 * トークンから PdfValue を1つ読み取る（再帰）。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @returns PdfValue、またはエラー
 */
function readValue(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  depth: number,
): Result<PdfValue, PdfParseError> {
  const token = bt.next();

  switch (token.type) {
    case TokenType.Null:
      return ok({ type: "null" });

    case TokenType.Boolean:
      return ok({ type: "boolean", value: token.value as boolean });

    case TokenType.Integer: {
      const intVal = token.value as number;
      if (Number.isNaN(intVal)) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `NaN integer token at offset ${token.offset}`,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      const refResult = tryReadIndirectRef(bt, baseOffset, intVal);
      if (refResult.some) {
        return refResult.value;
      }
      return ok({ type: "integer", value: intVal });
    }

    case TokenType.Real: {
      const realVal = token.value as number;
      if (Number.isNaN(realVal)) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `NaN real token at offset ${token.offset}`,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      return ok({ type: "real", value: realVal });
    }

    case TokenType.Name:
      return ok({ type: "name", value: token.value as string });

    case TokenType.LiteralString: {
      const literalResult = decodeLiteralString(token.value as string);
      if (!literalResult.ok) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: literalResult.error,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      return ok({
        type: "string",
        value: literalResult.value,
        encoding: "literal" as const,
      });
    }

    case TokenType.HexString: {
      const hexResult = decodeHexString(token.value as string);
      if (!hexResult.ok) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: hexResult.error,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      return ok({
        type: "string",
        value: hexResult.value,
        encoding: "hex" as const,
      });
    }

    case TokenType.ArrayBegin:
      return readArrayElements(bt, baseOffset, depth + 1, token);

    case TokenType.DictBegin:
      return readDictEntries(bt, baseOffset, depth + 1, token);

    case TokenType.EOF:
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unexpected EOF",
        offset: ByteOffset.add(baseOffset, token.offset),
      });

    default:
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Unexpected token type ${token.type}: ${String(token.value)}`,
        offset: ByteOffset.add(baseOffset, token.offset),
      });
  }
}

/**
 * Integer トークン後の `N G R` パターンを試行する。
 * 3トークン先読みしパターン不一致なら pushBack して None を返す。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param intVal - 先頭の integer 値（オブジェクト番号候補）
 * @returns 成立: Some(ok(indirect-ref))、不成立: None、N/G 不正: Some(err(...))
 */
function tryReadIndirectRef(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  intVal: number,
): Option<Result<PdfValue, PdfParseError>> {
  const second = bt.next();
  if (second.type !== TokenType.Integer) {
    bt.pushBack(second);
    return none;
  }

  const secondVal = second.value as number;
  if (Number.isNaN(secondVal)) {
    bt.pushBack(second);
    return none;
  }

  const third = bt.next();
  if (third.type === TokenType.Keyword && third.value === "R") {
    const objectNumber = ObjectNumber.create(intVal);
    if (!objectNumber.ok) {
      return some(
        err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `Invalid indirect reference object number: ${objectNumber.error}`,
          offset: ByteOffset.add(baseOffset, third.offset),
        }),
      );
    }
    const generationNumber = GenerationNumber.create(secondVal);
    if (!generationNumber.ok) {
      return some(
        err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `Invalid indirect reference generation number: ${generationNumber.error}`,
          offset: ByteOffset.add(baseOffset, third.offset),
        }),
      );
    }
    return some(
      ok({
        type: "indirect-ref",
        objectNumber: objectNumber.value,
        generationNumber: generationNumber.value,
      }),
    );
  }

  bt.pushBack(third);
  bt.pushBack(second);
  return none;
}

/**
 * 配列要素を `]` まで再帰的に読み取る。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @param openToken - `[` トークン（エラー報告用）
 * @returns 配列 PdfValue、またはエラー
 */
function readArrayElements(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  depth: number,
  openToken: Token,
): Result<PdfValue, PdfParseError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Array nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: ByteOffset.add(baseOffset, openToken.offset),
    });
  }

  const elements: PdfValue[] = [];
  while (true) {
    const token = bt.next();
    if (token.type === TokenType.ArrayEnd) {
      return ok({ type: "array", elements });
    }
    if (token.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated array",
        offset: ByteOffset.add(baseOffset, openToken.offset),
      });
    }
    bt.pushBack(token);
    const elemResult = readValue(bt, baseOffset, depth);
    if (!elemResult.ok) {
      return elemResult;
    }
    elements.push(elemResult.value);
  }
}

/**
 * 辞書エントリを `>>` まで読み取る。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @param openToken - `<<` トークン（エラー報告用）
 * @returns 辞書、またはエラー
 */
function readDictEntries(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  depth: number,
  openToken: Token,
): Result<PdfDictionary, PdfParseError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Dictionary nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: ByteOffset.add(baseOffset, openToken.offset),
    });
  }

  const entries = new Map<string, PdfValue>();
  while (true) {
    const keyToken = bt.next();
    if (keyToken.type === TokenType.DictEnd) {
      return ok({ type: "dictionary", entries });
    }
    if (keyToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated dictionary",
        offset: ByteOffset.add(baseOffset, openToken.offset),
      });
    }
    if (keyToken.type !== TokenType.Name) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Dictionary key must be a name, got ${keyToken.type}`,
        offset: ByteOffset.add(baseOffset, keyToken.offset),
      });
    }

    const valResult = readValue(bt, baseOffset, depth);
    if (!valResult.ok) {
      return valResult;
    }
    entries.set(keyToken.value as string, valResult.value);
  }
}
