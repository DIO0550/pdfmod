import {
  decodeHexString,
  decodeLiteralString,
} from "../../objects/object-parser/string-decoder/index";
import type {
  PdfError,
  PdfValue,
  Token,
  TokenHexString,
  TokenInteger,
  TokenLiteralString,
  TokenReal,
} from "../../pdf/index";
import { TokenType } from "../../pdf/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";

/**
 * content stream の primitive token を PdfValue へ変換する。
 *
 * interpreter のメインループと composite reader (`readArrayOperand`) の
 * 両方から呼ばれる共有純関数。primitive 7 種（Boolean / Integer / Real /
 * Name / Null / LiteralString / HexString）のみ `Some(PdfValue)` を返し、
 * それ以外（Operator / Keyword / InlineImage / Array/Dict 開閉 / EOF）は
 * `None` を返す。複合 delimiter の拒否や operator dispatch は呼び出し側の責務。
 *
 * @param token - 変換対象 token
 * @returns 変換した PdfValue、対象外 token の None、または変換エラー
 */
export function toPrimitivePdfValue(
  token: Token,
): Result<Option<PdfValue>, PdfError> {
  switch (token.type) {
    case TokenType.Boolean:
      return ok(some({ type: "boolean", value: token.value }));
    case TokenType.Integer:
      return integerToPdfValue(token);
    case TokenType.Real:
      return realToPdfValue(token);
    case TokenType.LiteralString:
      return literalStringToPdfValue(token);
    case TokenType.HexString:
      return hexStringToPdfValue(token);
    case TokenType.Name:
      return ok(some({ type: "name", value: token.value }));
    case TokenType.Null:
      return ok(some({ type: "null" }));
    default:
      return ok(none);
  }
}

function integerToPdfValue(
  token: TokenInteger,
): Result<Option<PdfValue>, PdfError> {
  if (Number.isNaN(token.value)) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `NaN integer token at offset ${token.offset}`,
      offset: token.offset,
    });
  }

  return ok(some({ type: "integer", value: token.value }));
}

function realToPdfValue(token: TokenReal): Result<Option<PdfValue>, PdfError> {
  if (Number.isNaN(token.value)) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `NaN real token at offset ${token.offset}`,
      offset: token.offset,
    });
  }

  return ok(some({ type: "real", value: token.value }));
}

function literalStringToPdfValue(
  token: TokenLiteralString,
): Result<Option<PdfValue>, PdfError> {
  const decoded = decodeLiteralString(token.value);
  if (!decoded.ok) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: decoded.error,
      offset: token.offset,
    });
  }

  return ok(
    some({
      type: "string",
      value: decoded.value,
      encoding: "literal",
    }),
  );
}

function hexStringToPdfValue(
  token: TokenHexString,
): Result<Option<PdfValue>, PdfError> {
  const decoded = decodeHexString(token.value);
  if (!decoded.ok) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: decoded.error,
      offset: token.offset,
    });
  }

  return ok(
    some({
      type: "string",
      value: decoded.value,
      encoding: "hex",
    }),
  );
}
