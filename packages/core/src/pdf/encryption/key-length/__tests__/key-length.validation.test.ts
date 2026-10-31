import { expect, test } from "vitest";
import { encryptionReader } from "../../__tests__/encryption.test.helpers";
import { KeyLength, KeyLengths } from "../index";

test.each(
  Object.values(KeyLengths),
)("暗号化辞書の鍵長%iビットを受理する", (bits) => {
  const reader = encryptionReader(`/Length ${bits}`);

  expect(KeyLength.fromEncryptionDictionary(reader)).toEqual({
    ok: true,
    value: bits,
  });
});

test("暗号化辞書の鍵長を省略すると40ビットになる", () => {
  const reader = encryptionReader("");

  expect(KeyLength.fromEncryptionDictionary(reader)).toEqual({
    ok: true,
    value: 40,
  });
});

test.each([
  0, 32, 44, 132, 256, -8,
])("暗号化辞書の不正な鍵長%iを位置付きで拒否する", (bits) => {
  const reader = encryptionReader(`/Length ${bits}`);

  expect(KeyLength.fromEncryptionDictionary(reader)).toMatchObject({
    ok: false,
    error: {
      code: "INVALID_KEY_LENGTH",
      key: "/Length",
      offset: reader.offset,
    },
  });
});

test.each([
  "/Invalid",
  "5 0 R",
  "40.0",
])("暗号化辞書の鍵長%sを直接整数として扱わない", (value) => {
  const reader = encryptionReader(`/Length ${value}`);

  expect(KeyLength.fromEncryptionDictionary(reader)).toMatchObject({
    ok: false,
    error: { code: "INVALID_KEY_TYPE", key: "/Length", offset: reader.offset },
  });
});
