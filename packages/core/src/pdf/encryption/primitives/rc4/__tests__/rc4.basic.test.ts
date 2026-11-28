import { assert, expect, test } from "vitest";
import { vectorBytes } from "../../__tests__/vectors.test.helpers";
import { Rc4 } from "../index";

test.each([
  [5, 0, "b2396305f03dc027ccc3524a0a1118a8"],
  [5, 256, "1cfcf62b03eddb641d77dfcf7f8d8c93"],
  [16, 0, "9ac7cc9a609d1ef7b2932899cde41b97"],
])("RFC 6229 の %i バイト鍵に対する位置 %i の鍵ストリームと一致する", (length, offset, expected) => {
  const key = Uint8Array.from({ length }, (_, index) => index + 1);
  const data = new Uint8Array(offset + 16);

  const result = Rc4.apply({ key, data });

  assert(result.ok);
  expect(result.value.subarray(offset)).toEqual(vectorBytes(expected));
});

test("暗号文を復号しても入力のバイト列は変わらない", () => {
  const key = new TextEncoder().encode("Secret");
  const data = vectorBytes("45a01f645fc35b383552544b9bf5");

  const result = Rc4.apply({ key, data });

  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("Attack at dawn");
  expect(data).toEqual(vectorBytes("45a01f645fc35b383552544b9bf5"));
});

test.each([
  0, 4, 17,
])("PDF で使えない %i バイトの RC4 鍵を拒否する", (length) => {
  const result = Rc4.apply({
    key: new Uint8Array(length),
    data: Uint8Array.of(42),
  });

  expect(result).toEqual({ ok: false, error: "INVALID_KEY_LENGTH" });
});
