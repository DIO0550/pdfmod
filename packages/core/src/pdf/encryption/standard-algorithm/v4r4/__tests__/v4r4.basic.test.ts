import { expect, test } from "vitest";
import { encryptionReader } from "../../../__tests__/encryption.test.helpers";
import { V4R4 } from "../index";

test("V4R4 は自身の方式と鍵長を返す", () => {
  const reader = encryptionReader("/CF << >> /Length 128");

  expect(V4R4.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: { kind: "V4R4", keyLength: 128 },
  });
});

test("V4R4 は鍵長省略時に40ビットを使う", () => {
  const reader = encryptionReader("/CF << >>");

  expect(V4R4.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: { keyLength: 40 },
  });
});

test("V4R4 の不正な鍵長は位置付きエラーになる", () => {
  const reader = encryptionReader("/CF << >> /Length 44");

  expect(V4R4.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: {
      code: "INVALID_KEY_LENGTH",
      key: "/Length",
      offset: reader.offset,
    },
  });
});

test("V4R4 は存在しないcrypt filterの参照を拒否する", () => {
  const reader = encryptionReader("/CF << >> /StmF /Missing");

  expect(V4R4.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: {
      code: "UNDEFINED_CRYPT_FILTER",
      key: "/StmF",
      offset: reader.offset,
    },
  });
});
