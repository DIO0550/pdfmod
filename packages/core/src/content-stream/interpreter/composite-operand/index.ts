import type {
  PdfArray,
  PdfError,
  PdfValue,
  TokenArrayBegin,
} from "../../../pdf/index";
import { TokenType, tokenDisplayString } from "../../../pdf/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import { toPrimitivePdfValue } from "../../primitive-operand-converter/index";
import type { ContentStreamTokenizer } from "../../tokenizer/index";

/**
 * 配列リテラルのネスト上限。direct-object reader と同値。
 * 悪意ある content stream による stack overflow を防ぐ defensive design。
 */
const MAX_NESTING_DEPTH = 100;

/**
 * content stream の配列リテラル `[ ... ]` を PdfArray として組み立てる。
 *
 * 呼び出し前に `ArrayBegin` token は既に消費済みであること。
 * 内部で `tokenizer.nextToken()` を `ArrayEnd` まで回し、
 * ネスト配列は再帰で処理する。要素は primitive または PdfArray のみ。
 * primitive token に変換できない token（Operator / Dict 開閉 / InlineImage / Keyword 等）は
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

    const objectResult = toPrimitivePdfValue(token);
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
