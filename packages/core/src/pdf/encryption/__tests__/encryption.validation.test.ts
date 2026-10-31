import { expect, test } from "vitest";
import { ByteOffset } from "../../types/byte-offset/index";
import { StandardAlgorithm } from "../index";
import { parseEncryption, standardEntries } from "./encryption.test.helpers";

test.each([
  ["", "/Filter"],
  ["/Filter /Standard", "/V"],
  ["/Filter /Standard /V 0", "/R"],
  ["/Filter /Standard /V 1 /R 2 /U () /P -4", "/O"],
  ["/Filter /Standard /V 1 /R 2 /O () /P -4", "/U"],
  ["/Filter /Standard /V 1 /R 2 /O () /U ()", "/P"],
  [standardEntries(4, 4), "/CF"],
  [standardEntries(5, 6, "/CF << >> /UE () /Perms ()"), "/OE"],
  [standardEntries(5, 5, "/CF << >> /OE () /Perms ()"), "/UE"],
  [standardEntries(5, 6, "/CF << >> /OE () /UE ()"), "/Perms"],
])("必須キーがない辞書 %s は %s の位置付きエラー", (entries, key) => {
  expect(parseEncryption(entries).result).toMatchObject({
    ok: false,
    error: { code: "MISSING_REQUIRED_KEY", key, offset: ByteOffset.of(7) },
  });
});

test.each([
  ["/Filter (Standard)", "/Filter"],
  [standardEntries(1, 2).replace("/V 1", "/V 1.0"), "/V"],
  [standardEntries(1, 2).replace("/R 2", "/R /Two"), "/R"],
  [standardEntries(1, 2).replace("/O <00FF>", "/O 4 0 R"), "/O"],
  [standardEntries(1, 2).replace("/U (user)", "/U true"), "/U"],
  [standardEntries(1, 2).replace("/P -4", "/P -4.0"), "/P"],
  [standardEntries(2, 3, "/Length 5 0 R"), "/Length"],
  [standardEntries(1, 2, "/EncryptMetadata 5 0 R"), "/EncryptMetadata"],
  [standardEntries(4, 4, "/CF 5 0 R"), "/CF"],
  [standardEntries(5, 6, "/CF << >> /OE 1 /UE () /Perms ()"), "/OE"],
])("型が異なる辞書 %s は %s のエラーで間接参照を解決しない", (entries, key) => {
  expect(parseEncryption(entries).result).toMatchObject({
    ok: false,
    error: { code: "INVALID_KEY_TYPE", key, offset: ByteOffset.of(7) },
  });
});

test.each([40, 48, 128])("可変長鍵 /Length %i ビットを受理する", (bits) => {
  expect(
    parseEncryption(standardEntries(2, 3, `/Length ${bits}`)).result,
  ).toMatchObject({
    ok: true,
    value: { handler: { algorithm: { keyLength: bits } } },
  });
});

test.each([
  0, 32, 44, 132, -8, 256,
])("可変長鍵 /Length %i は不正な鍵長", (bits) => {
  expect(
    parseEncryption(standardEntries(2, 3, `/Length ${bits}`)).result,
  ).toMatchObject({
    ok: false,
    error: { code: "INVALID_KEY_LENGTH", key: "/Length" },
  });
});

test.each([
  [1, 2, "/Length /Ignored", 40],
  [1, 3, "/Length 128", 40],
  [2, 3, "", 40],
  [4, 4, "/CF << >>", 40],
  [5, 6, "/CF << >> /OE () /UE () /Perms () /Length 5 0 R", 256],
])("/V %i /R %i のファイル鍵長は %s から %i ビットになる", (v, r, extra, bits) => {
  const { result } = parseEncryption(standardEntries(v, r, extra));

  expect(result.ok).toBe(true);

  if (!result.ok) {
    return;
  }

  expect(result.value.type).toBe("Standard");

  if (result.value.type !== "Standard") {
    return;
  }

  expect(StandardAlgorithm.keyLength(result.value.handler.algorithm)).toBe(
    bits,
  );
});

test.each([
  [-2147483648, -2147483648],
  [-4, -4],
  [0, 0],
  [2147483647, 2147483647],
  [4294967292, -4],
  [4294967295, -1],
])("/P %i は符号付きビットパターン %i として保持する", (input, bits) => {
  expect(
    parseEncryption(standardEntries(1, 2).replace("/P -4", `/P ${input}`))
      .result,
  ).toMatchObject({ ok: true, value: { handler: { permissions: { bits } } } });
});

test.each([
  -2147483649, 4294967296,
])("/P %i が32ビットに収まらなければエラー", (input) => {
  expect(
    parseEncryption(standardEntries(1, 2).replace("/P -4", `/P ${input}`))
      .result,
  ).toMatchObject({
    ok: false,
    error: { code: "INVALID_PERMISSIONS", key: "/P", offset: ByteOffset.of(7) },
  });
});

test("対応済み辞書のキーも未知のキーも変更しない", () => {
  const entries = standardEntries(
    4,
    4,
    "/CF << /StdCF << /CFM /AESV2 /Length 16 >> >> /StmF /StdCF /Custom 5 0 R",
  );
  const { raw } = parseEncryption(entries);

  expect([...raw.entries.keys()]).toEqual([
    "Filter",
    "V",
    "R",
    "O",
    "U",
    "P",
    "CF",
    "StmF",
    "Custom",
  ]);

  expect(raw.entries.get("CF")).toMatchObject({
    entries: new Map([
      [
        "StdCF",
        {
          type: "dictionary",
          entries: new Map([
            ["CFM", { type: "name", value: "AESV2" }],
            ["Length", { type: "integer", value: 16 }],
          ]),
        },
      ],
    ]),
  });
});
