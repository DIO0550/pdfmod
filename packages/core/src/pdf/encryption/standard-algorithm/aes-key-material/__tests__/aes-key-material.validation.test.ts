import { expect, test } from "vitest";
import { encryptionReader } from "../../../__tests__/encryption.test.helpers";
import { AesKeyMaterial } from "../index";

test("AESの追加鍵は長さや文字列デコードで内容を変えない", () => {
  const reader = encryptionReader("/OE <00FF> /UE () /Perms <80>");

  expect(AesKeyMaterial.fromDictionary(reader)).toEqual({
    ok: true,
    value: {
      ownerEncryptedKey: new Uint8Array([0, 255]),
      userEncryptedKey: new Uint8Array(),
      perms: new Uint8Array([128]),
    },
  });
});

test.each([
  ["/UE () /Perms ()", "/OE"],
  ["/OE () /Perms ()", "/UE"],
  ["/OE () /UE ()", "/Perms"],
])("追加鍵がない辞書%sは%sの位置付きエラー", (entries, key) => {
  const reader = encryptionReader(entries);

  expect(AesKeyMaterial.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: { code: "MISSING_REQUIRED_KEY", key, offset: reader.offset },
  });
});

test.each([
  ["/OE 1 /UE () /Perms ()", "/OE"],
  ["/OE () /UE /Invalid /Perms ()", "/UE"],
  ["/OE () /UE () /Perms 5 0 R", "/Perms"],
])("追加鍵の型が異なる辞書%sは%sの位置付きエラー", (entries, key) => {
  const reader = encryptionReader(entries);

  expect(AesKeyMaterial.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: { code: "INVALID_KEY_TYPE", key, offset: reader.offset },
  });
});
