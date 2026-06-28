import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenBoolean } from "../index";

test("TokenBoolean を PdfBoolean に passthrough する（value は加工せず保持）", () => {
  const token: TokenBoolean = {
    type: TokenType.Boolean,
    value: true,
    offset: ByteOffset.of(0),
  };
  const result = TokenBoolean.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "boolean", value: true });
});
