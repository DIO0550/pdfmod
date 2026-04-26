import { expect, test } from "vitest";
import { parsePdfDate } from "./parse-pdf-date";

test.each([
  ["20230101"],
  ["D:abcd"],
])("不正な PDF 日時 %s は undefined を返す", (raw) => {
  expect(parsePdfDate(raw)).toBeUndefined();
});
