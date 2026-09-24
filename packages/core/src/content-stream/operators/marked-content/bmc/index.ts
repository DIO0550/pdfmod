import { none } from "../../../../utils/option/index";
import { err, ok } from "../../../../utils/result/index";
import type { MarkedContentEntry } from "../../../marked-content/stack/index";
import { MarkedContentStack } from "../../../marked-content/stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "BMC";

/**
 * ISO 32000-2:2020 §14.6 `BMC` operator (begin marked-content sequence) のハンドラ。
 *
 * operand stack から tag (name) を 1 個 pop し、name 型であれば
 * `{ tag, properties: none }` を marked content stack へ push した
 * 新しいコンテキストを返す。
 *
 * 検査順序（厳守 / doHandler 準拠）:
 *   (1) operand pop（none なら `OPERATOR_OPERAND_MISSING`）
 *   (2) 型検査（PdfName.is が false なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *   (3) 両方通過 → MarkedContentStack.push して markedContentStack を差し替え ok
 *
 * - tag の値域（空文字 等）は検証しない。
 * - 更新するのは markedContentStack のみ。operandStack（pop で in-place 消費済み）・
 *   graphicsStateStack は入力と同一参照で返す。
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）。
 *
 * @param context - 実行コンテキスト
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const bmcHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const nameResult = OperandExtractor.popName(
    context.operandStack,
    OPERATOR_NAME,
  );
  if (!nameResult.ok) {
    return err(nameResult.error);
  }

  const entry: MarkedContentEntry = {
    tag: { type: "name", value: nameResult.value },
    properties: none,
  };
  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
    markedContentStack: MarkedContentStack.push(
      context.markedContentStack,
      entry,
    ),
  });
};
