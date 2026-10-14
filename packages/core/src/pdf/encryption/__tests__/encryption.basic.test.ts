import { expect, test } from "vitest";
import { parseEncryption, standardEntries } from "./encryption.test.helpers";

test.each([
  [1, 2, "V1R2", ""],
  [1, 3, "V1R3", ""],
  [2, 3, "V2R3", ""],
  [4, 4, "V4R4", "/CF << >>"],
  [5, 5, "V5R5", "/CF << >> /OE (owner) /UE (user) /Perms (perms)"],
  [5, 6, "V5R6", "/CF << >> /OE (owner) /UE (user) /Perms (perms)"],
])("/V %i /R %i は %s として表現される", (v, r, kind, extra) => {
  const { result } = parseEncryption(standardEntries(v, r, extra));
  expect(result).toMatchObject({
    ok: true,
    value: { type: "Standard", handler: { algorithm: { kind } } },
  });
});

test("/O と /U は文字列デコードせず元のバイト列を保持する", () => {
  const { result } = parseEncryption(standardEntries(1, 2));
  expect(result).toMatchObject({
    ok: true,
    value: {
      handler: {
        ownerKey: new Uint8Array([0, 255]),
        userKey: new TextEncoder().encode("user"),
      },
    },
  });
});

test("/R 6 の /OE /UE /Perms は長さを検証せず保持する", () => {
  const { result } = parseEncryption(
    standardEntries(5, 6, "/CF << >> /OE <00> /UE <01> /Perms <02>"),
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      handler: {
        algorithm: {
          keys: {
            ownerEncryptedKey: new Uint8Array([0]),
            userEncryptedKey: new Uint8Array([1]),
            perms: new Uint8Array([2]),
          },
        },
      },
    },
  });
});

test.each([
  "/Adobe.PubSec /Recipients [(opaque)]",
  "/Custom /Something 5 0 R",
])("未対応ハンドラ %s は欠損なく生辞書を保持する", (filter) => {
  const { result, raw } = parseEncryption(`/Filter ${filter}`);
  expect(result).toMatchObject({
    ok: true,
    value: { type: "Unsupported", raw },
  });
  if (result.ok && result.value.type === "Unsupported") {
    expect(result.value.raw).toBe(raw);
  }
});

test.each([
  [0, 2],
  [3, 3],
  [1, 6],
  [2, 2],
  [4, 3],
  [5, 4],
  [6, 6],
  [-1, 2],
])("未対応 /V %i /R %i は Standard にせず生辞書を保持する", (v, r) => {
  const { result, raw } = parseEncryption(
    `/Filter /Standard /V ${v} /R ${r} /Custom (keep)`,
  );
  expect(result).toEqual({
    ok: true,
    value: { type: "Unsupported", filter: "Standard", raw },
  });
});

test.each([true, false])("/EncryptMetadata %s を取り出す", (flag) => {
  const { result } = parseEncryption(
    standardEntries(1, 2, `/EncryptMetadata ${flag}`),
  );
  expect(result).toMatchObject({
    ok: true,
    value: { handler: { encryptMetadata: flag } },
  });
});

test("/EncryptMetadata の既定値は true", () => {
  expect(parseEncryption(standardEntries(1, 2)).result).toMatchObject({
    ok: true,
    value: { handler: { encryptMetadata: true } },
  });
});
