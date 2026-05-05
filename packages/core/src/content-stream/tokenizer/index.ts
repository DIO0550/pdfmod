import { Tokenizer } from "../../lexer/tokenizer/index";
import type { PdfError, Token } from "../../pdf/index";
import { Operator, TokenType } from "../../pdf/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";

const InlineImageBeginOperator = "BI";

/**
 * PDF content stream 用のトークナイザ。
 * 既存の PDF 字句トークンを読み取り、content stream 文脈の operator を再分類する。
 *
 * @remarks
 * Inline image（BI ... ID ... EI）は未サポート。ID 以降の画像データはPDF字句トークンではないため、
 * BI を検出した時点で `NOT_IMPLEMENTED` を返す。
 */
export class ContentStreamTokenizer {
  private readonly tokenizer: Tokenizer;

  /**
   * ContentStreamTokenizer を初期化する。
   *
   * @param data - トークン化対象の content stream バイト列
   */
  constructor(data: Uint8Array) {
    this.tokenizer = new Tokenizer(data);
  }

  /**
   * バイトストリーム内の現在位置。
   *
   * @returns 現在のバイトオフセット
   */
  get position(): number {
    return this.tokenizer.position;
  }

  /**
   * 次の content stream token を読み取る。
   *
   * @returns 読み取った token
   */
  nextToken(): Result<Token, PdfError> {
    const token = this.tokenizer.nextToken();

    if (token.type !== TokenType.Keyword) {
      return ok(token);
    }

    if (token.value === InlineImageBeginOperator) {
      return err({
        code: "NOT_IMPLEMENTED",
        message: "Inline image content streams are not supported",
        offset: token.offset,
      });
    }

    return ok(Operator.of(token.value, token.offset));
  }

  /**
   * 入力全体を content stream token として読み取る。
   *
   * @returns EOF を含む token 配列
   */
  tokenize(): Result<Token[], PdfError> {
    const tokens: Token[] = [];

    while (true) {
      const result = this.nextToken();

      if (!result.ok) {
        return result;
      }

      tokens.push(result.value);

      if (result.value.type === TokenType.EOF) {
        return ok(tokens);
      }
    }
  }
}
