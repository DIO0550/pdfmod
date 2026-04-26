import { expect, test } from "vitest";
import { parsePdfDate } from "./parse-pdf-date";

test("D: プレフィックスを欠いた文字列は undefined を返す", () => {
  expect(parsePdfDate("20230101")).toBeUndefined();
});
