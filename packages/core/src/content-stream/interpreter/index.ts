import type { PdfRectangle } from "../../document/page-tree/resolved-page/index";
import {
  type PdfFormXObject,
  type PdfImageXObject,
  PdfXObjectSubtype,
} from "../../document/resources/xobject/index";
import type { PdfWarning } from "../../pdf/errors/index";
import type {
  ContentStreamToken,
  Operator,
  PdfError,
  PdfStream,
  TokenArrayBegin,
  TokenDictBegin,
  TokenInlineImage,
} from "../../pdf/index";
import { Token, TokenType } from "../../pdf/index";
import { none } from "../../utils/option/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import {
  ClippingRule,
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../graphics-state/index";
import { PathSegment } from "../graphics-state/path-segment/index";
import { inlineImageHandler } from "../inline-image/handler/index";
import { MarkedContentStack } from "../marked-content/stack";
import { OperandStack } from "../operand-stack/index";
import {
  type OperatorHandlerContext,
  OperatorRegistry,
  type XObjectInvocation,
} from "../operator-registry/index";
import type { ContentStreamResources } from "../resources/index";
import { ContentStreamTokenizer } from "../tokenizer/index";
import { readArrayOperand, readDictOperand } from "./composite-operand/index";

const MAX_FORM_DEPTH = 32;

/**
 * `ContentStreamInterpreter.execute` の入力パラメータ。
 */
export type ContentStreamInterpreterExecuteOptions = {
  /** 実行対象の content stream バイト列 */
  readonly data: Uint8Array;
  /** operator handler の登録簿。省略時は全ビルトインオペレータを含むデフォルトレジストリが使用される */
  readonly registry?: OperatorRegistry;
  /** 呼び出し側が指定する任意の初期 context（省略時は新規生成される） */
  readonly initialContext?: OperatorHandlerContext;
  /** 実行対象のリソース。指定時は initialContext のスコープより優先される。 */
  readonly resources?: ContentStreamResources;
};

/**
 * `ContentStreamInterpreter.execute` の実行結果。
 */
export type ContentStreamInterpreterResult = {
  /** 実行完了時点の最終 context */
  readonly context: OperatorHandlerContext;
  /** 実行中に収集された warning の一覧 */
  readonly warnings: readonly PdfWarning[];
  /** Form 内も含め、Do が呼び出した画像を描画順に保持する。 */
  readonly images: readonly ImageXObjectDraw[];
};

/** Do が参照した画像と、その呼び出し位置で有効な描画状態。 */
export type ImageXObjectDraw = {
  readonly name: string;
  readonly image: PdfImageXObject;
  readonly graphicsState: GraphicsState;
  readonly resources: ContentStreamResources;
};

type InterpreterExecution = {
  readonly registry: OperatorRegistry;
  readonly activeForms: readonly PdfStream[];
};

type InterpreterStep =
  | InterpreterContinueStep
  | { readonly type: "done"; readonly context: OperatorHandlerContext };

type InterpreterContinueStep = {
  readonly type: "continue";
  readonly context: OperatorHandlerContext;
  readonly warnings?: readonly PdfWarning[];
  readonly images?: readonly ImageXObjectDraw[];
};

/**
 * Content stream (RPN 命令列) を解釈実行するインタプリタ。
 * Operator dispatch・inline image・複合オペランド (array/dict) の読み取りを統括する。
 */
export const ContentStreamInterpreter = {
  /**
   * Content stream の token 列をRPNとしてEOFまで逐次実行する。
   *
   * @param options - 入力データ、任意の registry、初期 context、解決済みリソース
   * @returns 最終状態・警告・画像の描画情報。構文・実行エラーは Err
   */
  execute(
    options: ContentStreamInterpreterExecuteOptions,
  ): Result<ContentStreamInterpreterResult, PdfError> {
    const registryResult =
      options.registry !== undefined
        ? ok(options.registry)
        : OperatorRegistry.createDefault();
    if (!registryResult.ok) {
      return err(registryResult.error);
    }
    const resources = options.resources ?? options.initialContext?.resources;
    const context = withResources(
      createInitialContext(options.initialContext),
      resources,
    );
    return executeStream(options.data, context, {
      registry: registryResult.value,
      activeForms: [],
    });
  },
} as const;

/**
 * 現在のストリームを実行し、命令順に警告と画像を収集する。
 * @param data - 復号済みの命令列
 * @param initialContext - このストリームの開始状態とリソース
 * @param execution - 命令の登録簿と実行中の Form
 * @returns 最終状態と描画対象。命令列の構文・実行エラーは Err
 */
function executeStream(
  data: Uint8Array,
  initialContext: OperatorHandlerContext,
  execution: InterpreterExecution,
): Result<ContentStreamInterpreterResult, PdfError> {
  const resources = initialContext.resources;
  const tokenizer = new ContentStreamTokenizer(data);
  const warnings: PdfWarning[] = [];
  const images: ImageXObjectDraw[] = [];
  let context = initialContext;

  while (true) {
    const tokenResult = tokenizer.nextToken();
    if (!tokenResult.ok) {
      return tokenResult;
    }

    const step = executeToken({
      token: tokenResult.value,
      tokenizer,
      execution,
      context,
    });
    if (!step.ok) {
      return step;
    }

    if (step.value.type === "done") {
      return ok({ context: step.value.context, warnings, images });
    }

    for (const warning of step.value.warnings ?? []) {
      warnings.push(warning);
    }

    for (const image of step.value.images ?? []) {
      images.push(image);
    }

    context = withResources(step.value.context, resources);
  }
}

/** ハンドラが従来のフィールドだけを返しても、実行開始時のスコープを保つ。 */
function withResources(
  context: OperatorHandlerContext,
  resources: ContentStreamResources | undefined,
): OperatorHandlerContext {
  return context.resources === resources ? context : { ...context, resources };
}

/**
 * 1 token を分類して以下のいずれかを実行する:
 * EOF（完了）/ operator dispatch / inline image dispatch / array reader dispatch /
 * dict reader dispatch / 複合 delimiter (`]` `>>`) の UNEXPECTED_TOKEN /
 * primitive operand の push。
 *
 * @param options.token - 実行対象 token
 * @param options.tokenizer - 配列・辞書リテラルの読み取りに使う tokenizer（reader へ委譲）
 * @param options.execution - operator handler 登録簿と実行中の Form
 * @param options.context - 現在 context
 * @returns 次 step、または処理エラー
 */
function executeToken(options: {
  readonly token: ContentStreamToken;
  readonly tokenizer: ContentStreamTokenizer;
  readonly execution: InterpreterExecution;
  readonly context: OperatorHandlerContext;
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
    return ok({ type: "done", context: options.context });
  }

  if (options.token.type === TokenType.Operator) {
    return dispatchOperator({
      token: options.token,
      execution: options.execution,
      context: options.context,
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
 * @param options - operator token、実行中の情報、現在context
 * @returns 次step、またはhandlerエラー
 */
function dispatchOperator(options: {
  readonly token: Operator;
  readonly execution: InterpreterExecution;
  readonly context: OperatorHandlerContext;
}): Result<InterpreterStep, PdfError> {
  const handler = OperatorRegistry.lookup(
    options.execution.registry,
    options.token.value,
  );
  if (!handler.some) {
    const warning: PdfWarning = {
      code: "UNKNOWN_OPERATOR",
      message: `Unknown operator: ${options.token.value}`,
      offset: options.token.offset,
    };
    OperandStack.clear(options.context.operandStack);
    return ok({
      type: "continue",
      context: options.context,
      warnings: [warning],
    });
  }

  const handled = handler.value(options.context);
  if (!handled.ok) {
    return err(handled.error);
  }

  const { warnings = [], xObject, ...context } = handled.value;
  const step = {
    type: "continue",
    context,
    warnings: warnings.map((warning) => ({
      ...warning,
      offset: options.token.offset,
    })),
  } as const;

  if (xObject === undefined) {
    return ok(step);
  }

  const { name, object, resources } = xObject;
  if (object.subtype === PdfXObjectSubtype.Image) {
    const image: ImageXObjectDraw = {
      name,
      image: object,
      graphicsState: context.graphicsStateStack.current,
      resources,
    };
    return ok({ ...step, images: [image] });
  }

  return executeForm({
    invocation: { ...xObject, object },
    step,
    execution: options.execution,
    offset: options.token.offset,
  });
}

/** Form の開始状態を作って実行し、描画対象と警告を呼び出し元の命令へ返す。 */
function executeForm(options: {
  readonly invocation: Omit<XObjectInvocation, "object"> & {
    readonly object: PdfFormXObject;
  };
  readonly step: InterpreterContinueStep;
  readonly execution: InterpreterExecution;
  readonly offset: number;
}): Result<InterpreterStep, PdfError> {
  const { invocation, step, execution, offset } = options;
  const { name, object: form, resources } = invocation;
  const { activeForms } = execution;
  const skip = (
    code: PdfWarning["code"],
    message: string,
  ): Result<InterpreterStep, PdfError> =>
    ok({
      ...step,
      warnings: [
        ...(step.warnings ?? []),
        { code, message: `Form /${name}: ${message}`, offset },
      ],
    });

  if (activeForms.includes(form.stream)) {
    return skip("FORM_XOBJECT_CYCLE", "recursive invocation was skipped");
  }

  if (activeForms.length >= MAX_FORM_DEPTH) {
    return skip(
      "FORM_XOBJECT_TOO_DEEP",
      `maximum nesting depth is ${MAX_FORM_DEPTH}`,
    );
  }

  const prepared = resources.getFormContent?.(form);
  if (prepared === undefined) {
    return skip("FORM_XOBJECT_PREPARE_FAILED", "content was not prepared");
  }

  if (!prepared.ok) {
    return skip(
      "FORM_XOBJECT_PREPARE_FAILED",
      `${prepared.error.code}: ${prepared.error.message}`,
    );
  }

  const { data, bbox, resources: local } = prepared.value;
  const caller = step.context.graphicsStateStack.current;
  const state = createFormState(caller, form.matrix, bbox);
  const childContext: OperatorHandlerContext = {
    // 暗黙の保存状態は呼び出し元に置き、Form 内の Q が取り出せないようにする。
    graphicsStateStack: { current: state, saved: [] },
    operandStack: OperandStack.create(),
    markedContentStack: MarkedContentStack.create(),
    resources: local.some ? local.value : resources,
  };

  const result = executeStream(data, childContext, {
    ...execution,
    activeForms: [...activeForms, form.stream],
  });
  if (!result.ok) {
    return err({
      ...result.error,
      message: `Form /${name}: ${result.error.message}`,
    });
  }

  const warnings = result.value.warnings.map((warning) => {
    const location =
      warning.offset === undefined ? "" : ` (byte ${warning.offset})`;
    return {
      ...warning,
      message: `Form /${name}${location}: ${warning.message}`,
      offset,
    };
  });
  return ok({
    ...step,
    warnings: [...(step.warnings ?? []), ...warnings],
    images: result.value.images,
  });
}

/**
 * Form 座標を現在の CTM に連結し、その座標系の境界でクリップする。
 * @param caller - 呼び出し元の描画状態
 * @param matrix - Form のローカル座標から呼び出し元への変換
 * @param bbox - Form 座標の境界
 * @returns Form の描画状態
 */
function createFormState(
  caller: GraphicsState,
  matrix: Matrix,
  bbox: PdfRectangle,
): GraphicsState {
  const state = GraphicsState.update(caller, {
    ctm: Matrix.multiply(matrix, caller.ctm),
    currentPath: CurrentPath.empty(),
    pendingClip: none,
    textObject: TextObject.inactive(),
  });
  const [left, bottom, right, top] = bbox;
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.rect(left, bottom, right - left, top - bottom),
  );

  return GraphicsState.intersectClippingPath(state, {
    path,
    rule: ClippingRule.nonzero(),
  });
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
  readonly token: TokenInlineImage;
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
  token: ContentStreamToken,
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
