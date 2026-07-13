import type { PdfError } from "../../../../pdf/errors/index";
import { PdfName } from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

const OPERATOR_NAME = "DP";
const OPERAND_COUNT = 2;

/**
 * ISO 32000-2:2020 §14.6 `DP` operator (marked-content point with property
 * list) のハンドラ。
 *
 * operand stack 頂上から properties → tag の順に 2 個 pop し、両方の型検査を
 * 通過したら 3 つの stack を入力と同一参照で保持した context を返す。DP は
 * 「単発マーク点」であり BMC/EMC の対を持たないため、`MarkedContentStack` への
 * push は行わない（BDC との本質的差分）。
 *
 * 検査順序（厳守 / bdcHandler 準拠）:
 *   (1) properties pop（none なら OPERATOR_OPERAND_MISSING, actual=0）
 *   (2) properties 型検査（dictionary/name 以外は OPERATOR_OPERAND_TYPE_MISMATCH）
 *   (3) tag pop（none なら OPERATOR_OPERAND_MISSING, actual=1）
 *   (4) tag 型検査（PdfName.is が false なら OPERATOR_OPERAND_TYPE_MISMATCH）
 *   (5) 全通過 → 3 つの stack を同一参照で列挙して ok
 *
 * `actual` フィールドの意味（既存 handler の流儀）:
 *   - MISSING: 数値。pop 成功数（0 段目失敗=0 / 1 段目失敗=1）
 *   - TYPE_MISMATCH: 文字列。実際に来た operand の `type` フィールド
 *
 * - properties が PdfName の場合、resource 解決は本 handler で行わない。
 * - dict の中身（/MCID, /ActualText 等）の妥当性は検証しない。
 * - tag の値域（空文字 等）は検証しない。
 * - operandStack は pop で in-place 消費済み。graphicsStateStack と
 *   markedContentStack は入力と同一参照で返す。
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）。
 *
 * @param context - 実行コンテキスト
 * @returns 成功なら入力と同じ 3 stack を持つコンテキスト、失敗なら PdfError
 */
export const dpHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const poppedProperties = OperandStack.pop(context.operandStack);
  if (!poppedProperties.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 0,
    };
    return err(error);
  }
  const properties = poppedProperties.value;

  if (properties.type !== "dictionary" && !PdfName.is(properties)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected name or dictionary operand, got ${properties.type}`,
      operatorName: OPERATOR_NAME,
      expected: "name or dictionary",
      actual: properties.type,
    };
    return err(error);
  }

  const poppedTag = OperandStack.pop(context.operandStack);
  if (!poppedTag.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 1`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 1,
    };
    return err(error);
  }
  const tag = poppedTag.value;

  if (!PdfName.is(tag)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected name operand, got ${tag.type}`,
      operatorName: OPERATOR_NAME,
      expected: "name",
      actual: tag.type,
    };
    return err(error);
  }

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
    markedContentStack: context.markedContentStack,
  });
};
