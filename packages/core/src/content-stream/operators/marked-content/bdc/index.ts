import type {
  PdfDictionary,
  PdfObject,
} from "../../../../pdf/types/pdf-types/index";
import { PdfName } from "../../../../pdf/types/pdf-types/index";
import { some } from "../../../../utils/option/index";
import { err, ok } from "../../../../utils/result/index";
import type { MarkedContentEntry } from "../../../marked-content/stack/index";
import { MarkedContentStack } from "../../../marked-content/stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "BDC";
const OPERAND_COUNT = 2;

/**
 * ISO 32000-2:2020 §14.6 `BDC` operator (begin marked-content sequence with
 * property list) のハンドラ。
 *
 * operand stack 頂上から properties → tag の順に 2 個 pop し、両方の型検査を
 * 通過したら `{ tag, properties: some(properties) }` を marked content stack へ
 * push した新しい context を返す。
 *
 * 検査順序（厳守 / bmcHandler / tfHandler 準拠）:
 *   (1) properties pop（none なら OPERATOR_OPERAND_MISSING, actual=0）
 *   (2) properties 型検査（dictionary/name 以外は OPERATOR_OPERAND_TYPE_MISMATCH）
 *   (3) tag pop（none なら OPERATOR_OPERAND_MISSING, actual=1）
 *   (4) tag 型検査（PdfName.is が false なら OPERATOR_OPERAND_TYPE_MISMATCH）
 *   (5) 全通過 → MarkedContentStack.push で markedContentStack を差し替えて ok
 *
 * `actual` フィールドの意味（既存 handler の流儀）:
 *   - MISSING: 数値。pop 成功数（0 段目失敗=0 / 1 段目失敗=1）
 *   - TYPE_MISMATCH: 文字列。実際に来た operand の `type` フィールド
 *
 * - properties が PdfName の場合、resource 解決は本 handler で行わない。
 * - dict の中身（/MCID, /ActualText 等）の妥当性は検証しない。
 * - 更新するのは markedContentStack のみ。operandStack（pop で in-place 消費済み）・
 *   graphicsStateStack は入力と同一参照で返す。
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）。
 *
 * @param context - 実行コンテキスト
 * @returns 成功なら更新後 context、失敗なら PdfError
 */
export const bdcHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const propertiesResult = OperandExtractor.popOperand(
    context.operandStack,
    OPERATOR_NAME,
    (operand: PdfObject): operand is PdfDictionary | PdfName =>
      operand.type === "dictionary" || PdfName.is(operand),
    "name or dictionary",
    OPERAND_COUNT,
    0,
  );
  if (!propertiesResult.ok) {
    return err(propertiesResult.error);
  }
  const validatedProperties = propertiesResult.value;

  const tagResult = OperandExtractor.popOperand(
    context.operandStack,
    OPERATOR_NAME,
    PdfName.is,
    "name",
    OPERAND_COUNT,
    1,
  );
  if (!tagResult.ok) {
    return err(tagResult.error);
  }
  const tag = tagResult.value;

  const entry: MarkedContentEntry = {
    tag,
    properties: some(validatedProperties),
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
