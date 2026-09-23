import { assert, describe, expect, it } from "vitest";
import type { PdfObject } from "../../../../pdf/types/pdf-types/index";
import { OperandStack } from "../../../operand-stack/index";
import { OperandExtractor } from "../index";

describe("OperandExtractor", () => {
  describe("popNumber", () => {
    it("integer または real の数値を pop して ok(数値) を返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "integer", value: 42 });
      const result = OperandExtractor.popNumber(stack, "w");
      assert(result.ok);
      expect(result.value).toBe(42);
      expect(OperandStack.depth(stack)).toBe(0);
    });

    it("空スタック時は OPERATOR_OPERAND_MISSING エラーを返す", () => {
      const stack = OperandStack.create();
      const result = OperandExtractor.popNumber(stack, "Tc");
      assert(!result.ok);
      assert(result.error.code === "OPERATOR_OPERAND_MISSING");
      expect(result.error.operatorName).toBe("Tc");
      expect(result.error.required).toBe(1);
      expect(result.error.actual).toBe(0);
    });

    it("非数値型の場合は OPERATOR_OPERAND_TYPE_MISMATCH エラーを返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "name", value: "Helvetica" });
      const result = OperandExtractor.popNumber(stack, "w");
      assert(!result.ok);
      assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
      expect(result.error.operatorName).toBe("w");
      expect(result.error.expected).toBe("number");
      expect(result.error.actual).toBe("name");
    });
  });

  describe("popNumbers", () => {
    it("複数数値を pop して RPN 順序（逆順）に復元して返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "integer", value: 10 });
      OperandStack.push(stack, { type: "real", value: 20.5 });
      OperandStack.push(stack, { type: "integer", value: 30 });
      const result = OperandExtractor.popNumbers(stack, "rg", 3);
      assert(result.ok);
      expect(result.value).toEqual([10, 20.5, 30]);
      expect(OperandStack.depth(stack)).toBe(0);
    });

    it("count=0 のときはスタックを消費せず空配列を返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "integer", value: 10 });
      const result = OperandExtractor.popNumbers(stack, "op", 0);
      assert(result.ok);
      expect(result.value).toEqual([]);
      expect(OperandStack.depth(stack)).toBe(1);
    });

    it("オペランド不足時は pop 成功数を actual に記録し部分消費のまま返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "integer", value: 1 });
      const result = OperandExtractor.popNumbers(stack, "rg", 3);
      assert(!result.ok);
      assert(result.error.code === "OPERATOR_OPERAND_MISSING");
      expect(result.error.required).toBe(3);
      expect(result.error.actual).toBe(1);
      expect(OperandStack.depth(stack)).toBe(0);
    });

    it("途中で型不一致の要素を検出した場合は TYPE_MISMATCH を返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "integer", value: 1 });
      OperandStack.push(stack, { type: "name", value: "bad" });
      const result = OperandExtractor.popNumbers(stack, "rg", 2);
      assert(!result.ok);
      assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
      expect(result.error.expected).toBe("number");
      expect(result.error.actual).toBe("name");
    });
  });

  describe("popName", () => {
    it("PdfName から文字列値を pop して ok(string) を返す", () => {
      const stack = OperandStack.create();
      OperandStack.push(stack, { type: "name", value: "F1" });
      const result = OperandExtractor.popName(stack, "Do");
      assert(result.ok);
      expect(result.value).toBe("F1");
      expect(OperandStack.depth(stack)).toBe(0);
    });
  });

  describe("popString", () => {
    it("string PdfObject を pop して ok(stringObject) を返す", () => {
      const stack = OperandStack.create();
      const strObj: PdfObject = {
        type: "string",
        value: new Uint8Array([65, 66]),
        encoding: "literal",
      };
      OperandStack.push(stack, strObj);
      const result = OperandExtractor.popString(stack, "Tj");
      assert(result.ok);
      expect(result.value).toEqual(strObj);
    });
  });

  describe("popOperand & インデックス指定", () => {
    it("カスタムガードで配列を pop できる", () => {
      const stack = OperandStack.create();
      const arrObj: PdfObject = { type: "array", elements: [] };
      OperandStack.push(stack, arrObj);
      const result = OperandExtractor.popOperand(
        stack,
        "TJ",
        (o): o is typeof arrObj => o.type === "array",
        "array",
      );
      assert(result.ok);
      expect(result.value).toEqual(arrObj);
    });

    it("requiredCount と actualIndex を反映した MISSING エラーを返す", () => {
      const stack = OperandStack.create();
      const result = OperandExtractor.popName(stack, "Tf", 2, 1);
      assert(!result.ok);
      assert(result.error.code === "OPERATOR_OPERAND_MISSING");
      expect(result.error.required).toBe(2);
      expect(result.error.actual).toBe(1);
    });
  });
});
