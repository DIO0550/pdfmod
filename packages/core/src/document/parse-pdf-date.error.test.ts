import { expect, test } from "vitest";
import { parsePdfDate } from "./parse-pdf-date";

test.each([
  ["20230101"],
  ["D:abcd"],
  ["D:20231345"],
  ["D:20230231"],
  ["D:20230229"],
  ["D:20230231000000+09'00'"],
  ["D:20230101246000"],
  ["D:20230101000061"],
  ["D:20230101000000+25'00'"],
])("不正な PDF 日時 %s は undefined を返す", (raw) => {
  expect(parsePdfDate(raw)).toBeUndefined();
});
