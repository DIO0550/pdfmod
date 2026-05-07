import {
  decodeHexString,
  decodeLiteralString,
} from "../../objects/object-parser/string-decoder/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type { PdfError, PdfObject, Token } from "../../pdf/index";
import { TokenType } from "../../pdf/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { GraphicsStateStack } from "../graphics-state/index";
import { OperandStack } from "../operand-stack/index";
import {
  type OperatorHandlerContext,
  OperatorRegistry,
} from "../operator-registry/index";
import { ContentStreamTokenizer } from "../tokenizer/index";

export type ContentStreamInterpreterExecuteOptions = {
  readonly data: Uint8Array;
  readonly registry: OperatorRegistry;
  readonly initialContext?: OperatorHandlerContext;
};

export type ContentStreamInterpreterResult = {
  readonly context: OperatorHandlerContext;
  readonly warnings: readonly PdfWarning[];
};

type InterpreterDoneResult = {
  readonly context: OperatorHandlerContext;
};

type InterpreterStep =
  | { readonly type: "continue"; readonly context: OperatorHandlerContext }
  | { readonly type: "done"; readonly result: InterpreterDoneResult };

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
 * 1 token を分類し、EOF / operator dispatch / operand push のいずれかを実行する。
 *
 * @param options - 実行対象token、現在context、warnings バッファ
 * @returns 次step、または処理エラー
 */
function executeToken(options: {
  readonly token: Token;
  readonly registry: OperatorRegistry;
  readonly context: OperatorHandlerContext;
  readonly warnings: PdfWarning[];
}): Result<InterpreterStep, PdfError> {
  if (options.token.type === TokenType.EOF) {
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
      offset: options.token.offset as number,
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
  const objectResult = tokenToPrimitivePdfObject(token);
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
  };
}

/**
 * content stream の primitive token をPdfObjectへ変換する。
 *
 * @param token - 変換対象token
 * @returns 変換したPdfObject、変換対象外tokenのNone、または変換エラー
 */
function tokenToPrimitivePdfObject(
  token: Token,
): Result<Option<PdfObject>, PdfError> {
  switch (token.type) {
    case TokenType.Boolean:
      return ok(some({ type: "boolean", value: token.value }));
    case TokenType.Integer:
      return integerToPdfObject(token);
    case TokenType.Real:
      return realToPdfObject(token);
    case TokenType.LiteralString:
      return literalStringToPdfObject(token);
    case TokenType.HexString:
      return hexStringToPdfObject(token);
    case TokenType.Name:
      return ok(some({ type: "name", value: token.value }));
    case TokenType.Null:
      return ok(some({ type: "null" }));
    case TokenType.ArrayBegin:
    case TokenType.DictBegin:
    case TokenType.InlineImage:
      return err({
        code: "NOT_IMPLEMENTED",
        message: `Composite content stream operand is not supported in Phase 3: ${token.type}`,
        offset: token.offset,
      });
    case TokenType.ArrayEnd:
    case TokenType.DictEnd:
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Unexpected composite delimiter in content stream: ${token.type}`,
        offset: token.offset,
      });
    default:
      return ok(none);
  }
}

/**
 * integer token をPdfIntegerへ変換する。
 *
 * @param token - integer token
 * @returns 変換したPdfInteger、またはNaN tokenエラー
 */
function integerToPdfObject(
  token: Extract<Token, { readonly type: TokenType.Integer }>,
): Result<Option<PdfObject>, PdfError> {
  if (Number.isNaN(token.value)) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `NaN integer token at offset ${token.offset}`,
      offset: token.offset,
    });
  }

  return ok(some({ type: "integer", value: token.value }));
}

/**
 * real token をPdfRealへ変換する。
 *
 * @param token - real token
 * @returns 変換したPdfReal、またはNaN tokenエラー
 */
function realToPdfObject(
  token: Extract<Token, { readonly type: TokenType.Real }>,
): Result<Option<PdfObject>, PdfError> {
  if (Number.isNaN(token.value)) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `NaN real token at offset ${token.offset}`,
      offset: token.offset,
    });
  }

  return ok(some({ type: "real", value: token.value }));
}

/**
 * literal string token をPdfStringへ変換する。
 *
 * @param token - literal string token
 * @returns 変換したPdfString、またはdecodeエラー
 */
function literalStringToPdfObject(
  token: Extract<Token, { readonly type: TokenType.LiteralString }>,
): Result<Option<PdfObject>, PdfError> {
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

/**
 * hex string token をPdfStringへ変換する。
 *
 * @param token - hex string token
 * @returns 変換したPdfString、またはdecodeエラー
 */
function hexStringToPdfObject(
  token: Extract<Token, { readonly type: TokenType.HexString }>,
): Result<Option<PdfObject>, PdfError> {
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
