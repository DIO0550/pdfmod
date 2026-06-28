import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenNull } from "../index";

test("TokenNull を PdfNull に変換する", () => {
  const token: TokenNull = {
    type: TokenType.Null,
    value: null,
    offset: ByteOffset.of(7),
  };
  const result = TokenNull.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "null" });
});
