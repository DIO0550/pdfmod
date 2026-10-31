import { expect, test } from "vitest";
import { encryptionReader } from "../../../__tests__/encryption.test.helpers";
import { V5R6 } from "../index";

test("V5R6 は自身の方式と鍵長を返す", () => {
  const reader = encryptionReader(
    "/CF << >> /OE <00> /UE <01> /Perms <02> /Length 128",
  );

  expect(V5R6.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: { kind: "V5R6", keyLength: 256 },
  });
});

test("V5R6 は存在しないcrypt filterの参照を拒否する", () => {
  const reader = encryptionReader(
    "/CF << >> /OE <00> /UE <01> /Perms <02> /StmF /Missing",
  );

  expect(V5R6.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: {
      code: "UNDEFINED_CRYPT_FILTER",
      key: "/StmF",
      offset: reader.offset,
    },
  });
});

test("V5R6 は追加鍵の欠落を位置付きエラーとして返す", () => {
  const reader = encryptionReader("/CF << >> /OE () /UE ()");

  expect(V5R6.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: {
      code: "MISSING_REQUIRED_KEY",
      key: "/Perms",
      offset: reader.offset,
    },
  });
});
