import { expect, test } from "vitest";
import { encryptionReader } from "../../../__tests__/encryption.test.helpers";
import { V2R3 } from "../index";

test("V2R3 は自身の方式と鍵長を返す", () => {
  const reader = encryptionReader(" /Length 128");

  expect(V2R3.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: { kind: "V2R3", keyLength: 128 },
  });
});

test("V2R3 は鍵長省略時に40ビットを使う", () => {
  const reader = encryptionReader("");

  expect(V2R3.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: { keyLength: 40 },
  });
});

test("V2R3 の不正な鍵長は位置付きエラーになる", () => {
  const reader = encryptionReader(" /Length 44");

  expect(V2R3.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: {
      code: "INVALID_KEY_LENGTH",
      key: "/Length",
      offset: reader.offset,
    },
  });
});
