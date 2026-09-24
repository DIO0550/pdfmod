import type { PdfError } from "../../../pdf/errors/index";
import { PdfName, type PdfObject } from "../../../pdf/types/pdf-types/index";
import { err, ok, type Result } from "../../../utils/result/index";
import { OperandStack } from "../../operand-stack/index";
import { NumericPdfObject } from "../graphics-state/numeric-pdf-object/index";

/**
 * オペレータハンドラ用のオペランド検証・抽出コンパニオンオブジェクト。
 * OperandStack からの pop、型検証、および PdfError 構築の定型処理を集約する。
 */
export const OperandExtractor = {
  /**
   * OperandStack から単一の数値（integer または real）オペランドを pop して検証する。
   *
   * @param stack - オペランドスタック
   * @param operatorName - エラーメッセージ用のオペレータ識別名
   * @param requiredCount - オペレータが要求する総オペランド数（既定値: 1）
   * @param actualIndex - 欠損時に報告する現在の pop インデックス（既定値: 0）
   * @returns 成功時は抽出された数値、失敗時は PdfError
   */
  popNumber(
    stack: OperandStack,
    operatorName: string,
    requiredCount = 1,
    actualIndex = 0,
  ): Result<number, PdfError> {
    const popped = OperandStack.pop(stack);
    if (!popped.some) {
      return err({
        code: "OPERATOR_OPERAND_MISSING",
        message: `Operator '${operatorName}' requires ${requiredCount} operand(s), got ${actualIndex}`,
        operatorName,
        required: requiredCount,
        actual: actualIndex,
      });
    }
    const operand = popped.value;
    if (!NumericPdfObject.is(operand)) {
      return err({
        code: "OPERATOR_OPERAND_TYPE_MISMATCH",
        message: `Operator '${operatorName}' expected number operand, got ${operand.type}`,
        operatorName,
        expected: "number",
        actual: operand.type,
      });
    }
    return ok(operand.value);
  },

  /**
   * OperandStack から指定された個数の数値オペランドを pop して検証し、
   * コンテンツストリームの記述順（RPN 引数順）に復元して返す。
   *
   * @param stack - オペランドスタック
   * @param operatorName - エラーメッセージ用のオペレータ識別名
   * @param count - 要求する数値オペランドの個数
   * @returns 成功時は記述順の数値配列、失敗時は PdfError
   */
  popNumbers(
    stack: OperandStack,
    operatorName: string,
    count: number,
  ): Result<number[], PdfError> {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      const popped = OperandStack.pop(stack);
      if (!popped.some) {
        return err({
          code: "OPERATOR_OPERAND_MISSING",
          message: `Operator '${operatorName}' requires ${count} operand(s), got ${i}`,
          operatorName,
          required: count,
          actual: i,
        });
      }
      const operand = popped.value;
      if (!NumericPdfObject.is(operand)) {
        return err({
          code: "OPERATOR_OPERAND_TYPE_MISMATCH",
          message: `Operator '${operatorName}' expected number operand, got ${operand.type}`,
          operatorName,
          expected: "number",
          actual: operand.type,
        });
      }
      values.push(operand.value);
    }
    values.reverse();
    return ok(values);
  },

  /**
   * OperandStack から単一の名前（PdfName）オペランドを pop して検証し、
   * その名前文字列値を返す。
   *
   * @param stack - オペランドスタック
   * @param operatorName - エラーメッセージ用のオペレータ識別名
   * @param requiredCount - オペレータが要求する総オペランド数（既定値: 1）
   * @param actualIndex - 欠損時に報告する現在の pop インデックス（既定値: 0）
   * @returns 成功時は名前文字列、失敗時は PdfError
   */
  popName(
    stack: OperandStack,
    operatorName: string,
    requiredCount = 1,
    actualIndex = 0,
  ): Result<string, PdfError> {
    const popped = OperandStack.pop(stack);
    if (!popped.some) {
      return err({
        code: "OPERATOR_OPERAND_MISSING",
        message: `Operator '${operatorName}' requires ${requiredCount} operand(s), got ${actualIndex}`,
        operatorName,
        required: requiredCount,
        actual: actualIndex,
      });
    }
    const operand = popped.value;
    if (!PdfName.is(operand)) {
      return err({
        code: "OPERATOR_OPERAND_TYPE_MISMATCH",
        message: `Operator '${operatorName}' expected name operand, got ${operand.type}`,
        operatorName,
        expected: "name",
        actual: operand.type,
      });
    }
    return ok(operand.value);
  },

  /**
   * OperandStack から単一の文字列（PdfString）オペランドを pop して検証する。
   *
   * @param stack - オペランドスタック
   * @param operatorName - エラーメッセージ用のオペレータ識別名
   * @param requiredCount - オペレータが要求する総オペランド数（既定値: 1）
   * @param actualIndex - 欠損時に報告する現在の pop インデックス（既定値: 0）
   * @returns 成功時は文字列オブジェクト、失敗時は PdfError
   */
  popString(
    stack: OperandStack,
    operatorName: string,
    requiredCount = 1,
    actualIndex = 0,
  ): Result<Extract<PdfObject, { type: "string" }>, PdfError> {
    const popped = OperandStack.pop(stack);
    if (!popped.some) {
      return err({
        code: "OPERATOR_OPERAND_MISSING",
        message: `Operator '${operatorName}' requires ${requiredCount} operand(s), got ${actualIndex}`,
        operatorName,
        required: requiredCount,
        actual: actualIndex,
      });
    }
    const operand = popped.value;
    if (operand.type !== "string") {
      return err({
        code: "OPERATOR_OPERAND_TYPE_MISMATCH",
        message: `Operator '${operatorName}' expected string operand, got ${operand.type}`,
        operatorName,
        expected: "string",
        actual: operand.type,
      });
    }
    return ok(operand);
  },

  /**
   * 指定した型ガードを用いて OperandStack から単一のオペランドを pop して検証する汎用関数。
   *
   * @param stack - オペランドスタック
   * @param operatorName - エラーメッセージ用のオペレータ識別名
   * @param guard - 対象型の型ガード関数
   * @param expectedTypeName - エラーメッセージ用の期待型名
   * @param requiredCount - オペレータが要求する総オペランド数（既定値: 1）
   * @param actualIndex - 欠損時に報告する現在の pop インデックス（既定値: 0）
   * @returns 成功時は型付けされたオペランドオブジェクト、失敗時は PdfError
   */
  popOperand<T extends PdfObject>(
    stack: OperandStack,
    operatorName: string,
    guard: (operand: PdfObject) => operand is T,
    expectedTypeName: string,
    requiredCount = 1,
    actualIndex = 0,
  ): Result<T, PdfError> {
    const popped = OperandStack.pop(stack);
    if (!popped.some) {
      return err({
        code: "OPERATOR_OPERAND_MISSING",
        message: `Operator '${operatorName}' requires ${requiredCount} operand(s), got ${actualIndex}`,
        operatorName,
        required: requiredCount,
        actual: actualIndex,
      });
    }
    const operand = popped.value;
    if (!guard(operand)) {
      return err({
        code: "OPERATOR_OPERAND_TYPE_MISMATCH",
        message: `Operator '${operatorName}' expected ${expectedTypeName} operand, got ${operand.type}`,
        operatorName,
        expected: expectedTypeName,
        actual: operand.type,
      });
    }
    return ok(operand);
  },
} as const;
