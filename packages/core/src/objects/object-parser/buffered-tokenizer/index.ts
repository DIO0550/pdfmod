import type { Tokenizer } from "../../../lexer/tokenizer/index";
import type { LexicalToken } from "../../../pdf/types/index";

/**
 * Tokenizer をラップし pushBack によるトークンの巻き戻しを提供する。
 */
export class BufferedTokenizer {
  private readonly tokenizer: Tokenizer;
  private readonly buffer: LexicalToken[] = [];

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
  next(): LexicalToken {
    const buffered = this.buffer.pop();
    if (buffered !== undefined) {
      return buffered;
    }
    return this.tokenizer.nextToken();
  }

  /**
   * トークンをバッファに戻す（スタック方式）。
   *
   * @param token - 戻すトークン
   */
  pushBack(token: LexicalToken): void {
    this.buffer.push(token);
  }

  /**
   * 内部 Tokenizer の現在位置を返す。
   *
   * @returns バイトオフセット
   */
  get position(): number {
    return this.tokenizer.position;
  }
}
