import { expect, test } from "vitest";
import { encryptionReader } from "../../../__tests__/encryption.test.helpers";
import { Aes256Parameters } from "../index";

test.each([
  "",
  "/Length 128",
  "/Length 5 0 R",
])("AES-256の鍵長は直下の%sに依存しない", (length) => {
  const reader = encryptionReader(
    `/CF << >> /OE <00> /UE <01> /Perms <02> ${length}`,
  );

  expect(Aes256Parameters.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: {
      keyLength: 256,
      keys: {
        ownerEncryptedKey: new Uint8Array([0]),
        userEncryptedKey: new Uint8Array([1]),
        perms: new Uint8Array([2]),
      },
    },
  });
});

test("AES-256は文字列とストリームの別々のフィルター指定を保持する", () => {
  const reader = encryptionReader(
    "/CF << /StdCF << /CFM /AESV3 >> >> /StmF /StdCF /StrF /Identity /OE () /UE () /Perms ()",
  );

  expect(Aes256Parameters.fromDictionary(reader)).toMatchObject({
    ok: true,
    value: {
      cryptFilters: {
        stream: { type: "Named", name: "StdCF" },
        string: { type: "Identity" },
      },
    },
  });
});

test("AES-256はcrypt filter辞書の欠落を位置付きで返す", () => {
  const reader = encryptionReader("/OE () /UE () /Perms ()");

  expect(Aes256Parameters.fromDictionary(reader)).toMatchObject({
    ok: false,
    error: { code: "MISSING_REQUIRED_KEY", key: "/CF", offset: reader.offset },
  });
});
