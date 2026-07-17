import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  PdfError,
  TokenArrayBegin,
  TokenDictBegin,
} from "../../pdf/index";
import { Token, TokenType } from "../../pdf/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { GraphicsStateStack } from "../graphics-state/index";
import { inlineImageHandler } from "../inline-image/handler/index";
import { MarkedContentStack } from "../marked-content/stack";
import { OperandStack } from "../operand-stack/index";
import {
  type OperatorHandlerContext,
  OperatorRegistry,
} from "../operator-registry/index";
import { ContentStreamTokenizer } from "../tokenizer/index";
import { readArrayOperand, readDictOperand } from "./composite-operand/index";

/**
 * `ContentStreamInterpreter.execute` の入力パラメータ。
 */
export type ContentStreamInterpreterExecuteOptions = {
  /** 実行対象の content stream バイト列 */
  readonly data: Uint8Array;
  /** operator handler の登録簿 */
  readonly registry: OperatorRegistry;
  /** 呼び出し側が指定する任意の初期 context（省略時は新規生成される） */
  readonly initialContext?: OperatorHandlerContext;
};

/**
 * `ContentStreamInterpreter.execute` の実行結果。
 */
export type ContentStreamInterpreterResult = {
  /** 実行完了時点の最終 context */
  readonly context: OperatorHandlerContext;
  /** 実行中に収集された warning の一覧 */
  readonly warnings: readonly PdfWarning[];
};

type InterpreterDoneResult = {
  readonly context: OperatorHandlerContext;
};

type InterpreterStep =
  | { readonly type: "continue"; readonly context: OperatorHandlerContext }
  | { readonly type: "done"; readonly result: InterpreterDoneResult };

/**
 * Content stream (RPN 命令列) を解釈実行するインタプリタ。
 * Operator dispatch・inline image・複合オペランド (array/dict) の読み取りを統括する。
 */
export const ContentStreamInterpreter = {
  /**
   * Content stream の token 列をRPNとしてEOFまで逐次実行する。
   *
   * @param options - 入力データ、operator registry、任意の初期context
   * @returns 最終context、またはtokenize / 変換 / handlerのエラー
   */
  execute(
    options: ContentStreamInterpreterExecuteOptions,
  ): Result<ContentStreamInterpreterResult, PdfError> {
    const tokenizer = new ContentStreamTokenizer(options.data);
    let context = createInitialContext(options.initialContext);
    const warnings: PdfWarning[] = [];

    while (true) {
      const tokenResult = tokenizer.nextToken();
      if (!tokenResult.ok) {
        return err(tokenResult.error);
      }

      const step = executeToken({
        token: tokenResult.value,
        tokenizer,
        registry: options.registry,
        context,
        warnings,
      });
      if (!step.ok) {
        return err(step.error);
      }

      if (step.value.type === "done") {
        return ok({
          context: step.value.result.context,
          warnings,
        });
      }

      context = step.value.context;
    }
  },
} as const;

/**
 * 1 token を分類して以下のいずれかを実行する:
 * EOF（完了）/ operator dispatch / inline image dispatch / array reader dispatch /
 * dict reader dispatch / 複合 delimiter (`]` `>>`) の UNEXPECTED_TOKEN /
 * primitive operand の push。
 *
 * @param options.token - 実行対象 token
 * @param options.tokenizer - 配列・辞書リテラルの読み取りに使う tokenizer（reader へ委譲）
 * @param options.registry - operator handler 登録簿
 * @param options.context - 現在 context
 * @param options.warnings - 警告蓄積バッファ
 * @returns 次 step、または処理エラー
 */
function executeToken(options: {
  readonly token: Token;
  readonly tokenizer: ContentStreamTokenizer;
  readonly registry: OperatorRegistry;
  readonly context: OperatorHandlerContext;
  readonly warnings: PdfWarning[];
}): Result<InterpreterStep, PdfError> {
  if (options.token.type === TokenType.EOF) {
    const unterminated = MarkedContentStack.pop(
      options.context.markedContentStack,
    );
    if (unterminated.some) {
      const depth = MarkedContentStack.depth(
        options.context.markedContentStack,
      );
      const lastTag = unterminated.value.popped.tag.value;
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: `Unterminated marked-content sequence(s): depth=${depth}, last tag=/${lastTag}`,
        offset: options.token.offset,
      });
    }
    return ok({ type: "done", result: { context: options.context } });
  }

  if (options.token.type === TokenType.Operator) {
    return dispatchOperator({
      token: options.token,
      registry: options.registry,
      context: options.context,
      warnings: options.warnings,
    });
  }

  if (options.token.type === TokenType.InlineImage) {
    return dispatchInlineImage({
      token: options.token,
      context: options.context,
    });
  }

  if (options.token.type === TokenType.ArrayBegin) {
    return dispatchArrayOperand({
      tokenizer: options.tokenizer,
      openToken: options.token,
      context: options.context,
    });
  }

  if (options.token.type === TokenType.DictBegin) {
    return dispatchDictOperand({
      tokenizer: options.tokenizer,
      openToken: options.token,
      context: options.context,
    });
  }

  if (
    options.token.type === TokenType.ArrayEnd ||
    options.token.type === TokenType.DictEnd
  ) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Unexpected composite delimiter: ${options.token.type}`,
      offset: options.token.offset,
    });
  }

  return pushPrimitiveOperand(options.token, options.context);
}

/**
 * 登録済みoperator handlerを呼び出す。未登録operatorはUNKNOWN_OPERATOR warningを
 * emitし、operand stackをclearして継続する。
 *
 * @param options - operator token、registry、現在context、warnings バッファ
 * @returns 次step、またはhandlerエラー
 */
function dispatchOperator(options: {
  readonly token: Extract<Token, { readonly type: TokenType.Operator }>;
  readonly registry: OperatorRegistry;
  readonly context: OperatorHandlerContext;
  readonly warnings: PdfWarning[];
}): Result<InterpreterStep, PdfError> {
  const handler = OperatorRegistry.lookup(options.registry, options.token.name);
  if (!handler.some) {
    options.warnings.push({
      code: "UNKNOWN_OPERATOR",
      message: `Unknown operator: ${options.token.name}`,
      offset: options.token.offset,
    });
    OperandStack.clear(options.context.operandStack);
    return ok({ type: "continue", context: options.context });
  }

  const handled = handler.value(options.context);
  if (!handled.ok) {
    return err(handled.error);
  }

  return ok({ type: "continue", context: handled.value });
}

/**
 * TokenInlineImage を inlineImageHandler に委譲する。
 * OperatorRegistry は経由しない（token 種別レベルで直接分岐するため、
 * 既存 operator 系の登録経路とは別経路で扱う）。
 *
 * @param options - inline image token と現在context
 * @returns 次step、または検査エラー
 */
function dispatchInlineImage(options: {
  readonly token: Extract<Token, { readonly type: TokenType.InlineImage }>;
  readonly context: OperatorHandlerContext;
}): Result<InterpreterStep, PdfError> {
  const handled = inlineImageHandler(options.context, options.token);
  if (!handled.ok) {
    return err(handled.error);
  }
  return ok({ type: "continue", context: handled.value });
}

/**
 * 配列リテラル `[ ... ]` を reader に委譲して PdfArray を operand stack へ積む。
 *
 * @param options - tokenizer・開きトークン・現在 context
 * @returns 次 step、または reader エラー
 */
function dispatchArrayOperand(options: {
  readonly tokenizer: ContentStreamTokenizer;
  readonly openToken: TokenArrayBegin;
  readonly context: OperatorHandlerContext;
}): Result<InterpreterStep, PdfError> {
  const array = readArrayOperand(options.tokenizer, options.openToken);
  if (!array.ok) {
    return err(array.error);
  }
  OperandStack.push(options.context.operandStack, array.value);
  return ok({ type: "continue", context: options.context });
}

/**
 * 辞書リテラル `<< ... >>` を reader に委譲して PdfDictionary を operand stack へ積む。
 *
 * @param options - tokenizer・開きトークン・現在 context
 * @returns 次 step、または reader エラー
 */
function dispatchDictOperand(options: {
  readonly tokenizer: ContentStreamTokenizer;
  readonly openToken: TokenDictBegin;
  readonly context: OperatorHandlerContext;
}): Result<InterpreterStep, PdfError> {
  const dictionary = readDictOperand(options.tokenizer, options.openToken);
  if (!dictionary.ok) {
    return err(dictionary.error);
  }
  OperandStack.push(options.context.operandStack, dictionary.value);
  return ok({ type: "continue", context: options.context });
}

/**
 * primitive token をPdfObjectへ変換してoperand stackへ積む。
 *
 * @param token - operand候補token
 * @param context - 現在context
 * @returns 次step、または変換エラー
 */
function pushPrimitiveOperand(
  token: Token,
  context: OperatorHandlerContext,
): Result<InterpreterStep, PdfError> {
  const objectResult = Token.toPrimitivePdfValue(token);
  if (!objectResult.ok) {
    return err(objectResult.error);
  }

  if (objectResult.value.some) {
    OperandStack.push(context.operandStack, objectResult.value.value);
  }

  return ok({ type: "continue", context });
}

/**
 * 初期contextを生成する。
 *
 * @param initialContext - 呼び出し側が渡した任意の初期context
 * @returns 実行開始時のcontext
 */
function createInitialContext(
  initialContext: OperatorHandlerContext | undefined,
): OperatorHandlerContext {
  if (initialContext !== undefined) {
    return initialContext;
  }

  return {
    operandStack: OperandStack.create(),
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };
}
