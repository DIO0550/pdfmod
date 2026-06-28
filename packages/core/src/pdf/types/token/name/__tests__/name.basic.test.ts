import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenName } from "../index";

test("TokenName を PdfName に passthrough する（value は加工せず保持）", () => {
  const token: TokenName = {
    type: TokenType.Name,
    value: "Type",
    offset: ByteOffset.of(0),
  };
  const result = TokenName.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "name", value: "Type" });
});
