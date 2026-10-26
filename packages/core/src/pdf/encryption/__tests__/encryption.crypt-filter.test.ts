import { expect, test } from "vitest";
import type { CryptFilters } from "../index";
import { parseEncryption, standardEntries } from "./encryption.test.helpers";

const parseFilters = (extra: string): CryptFilters => {
  const { result } = parseEncryption(standardEntries(4, 4, extra));

  expect(result).toMatchObject({
    ok: true,
    value: { type: "Standard", handler: { algorithm: { kind: "V4R4" } } },
  });

  if (!result.ok) {
    throw new Error("crypt filter の解析失敗");
  }

  if (result.value.type !== "Standard") {
    throw new Error("標準ハンドラが必要");
  }

  if (result.value.handler.algorithm.kind !== "V4R4") {
    throw new Error("V4R4 が必要");
  }

  return result.value.handler.algorithm.cryptFilters;
};

test.each([
  [5, 40],
  [16, 128],
  [40, 40],
  [128, 128],
  [6, 48],
  [48, 48],
])("/CF の /Length %i は %i ビットへ正規化する", (raw, bits) => {
  const filters = parseFilters(
    `/CF << /StdCF << /CFM /V2 /Length ${raw} >> >>`,
  );

  expect(filters.filters.get("StdCF")?.length).toEqual({
    some: true,
    value: bits,
  });
});

test.each([
  "-1",
  "4",
  "17",
  "32",
  "44",
  "256",
  "65536",
  "16.0",
  "null",
  "/Bad",
  "5 0 R",
])("/CF の無効な /Length %s は解決せず無視する", (length) => {
  expect(
    parseFilters(`/CF << /StdCF << /Length ${length} >> >>`).filters.get(
      "StdCF",
    )?.length,
  ).toEqual({ some: false });
});

test.each([
  "None",
  "V2",
  "AESV2",
  "AESV3",
])("/CFM /%s を型に取り出す", (method) => {
  expect(
    parseFilters(`/CF << /StdCF << /CFM /${method} >> >>`).filters.get("StdCF")
      ?.method,
  ).toBe(method);
});

test("/CFM・/AuthEvent・/Length の省略値を保持する", () => {
  expect(parseFilters("/CF << /StdCF << >> >>").filters.get("StdCF")).toEqual({
    method: "None",
    authEvent: "DocOpen",
    length: { some: false },
  });
});

test.each([
  ["/EFOpen", "EFOpen"],
  ["/DocOpen", "DocOpen"],
  ["/Unknown", "DocOpen"],
  ["1", "DocOpen"],
  ["5 0 R", "DocOpen"],
])("/AuthEvent %s は %s として扱う", (auth, expected) => {
  expect(
    parseFilters(`/CF << /StdCF << /AuthEvent ${auth} >> >>`).filters.get(
      "StdCF",
    )?.authEvent,
  ).toBe(expected);
});

test("省略された /StmF・/StrF は Identity、/EFF は None", () => {
  const filters = parseFilters("/CF << >>");

  expect([filters.stream, filters.string, filters.embeddedFile]).toEqual([
    { type: "Identity" },
    { type: "Identity" },
    { some: false },
  ]);
});

test("/Identity は /CF に定義がなくても組み込みとして扱う", () => {
  const filters = parseFilters(
    "/CF << >> /StmF /Identity /StrF /Identity /EFF /Identity",
  );

  expect([filters.stream, filters.string, filters.embeddedFile]).toEqual([
    { type: "Identity" },
    { type: "Identity" },
    { some: true, value: { type: "Identity" } },
  ]);
});

test("名前付きセレクタは対応する /CF を指す", () => {
  const filters = parseFilters(
    "/CF << /Stream << /CFM /AESV2 >> /String << /CFM /V2 >> >> /StmF /Stream /StrF /String /EFF /Stream",
  );

  expect([filters.stream, filters.string, filters.embeddedFile]).toEqual([
    { type: "Named", name: "Stream" },
    { type: "Named", name: "String" },
    { some: true, value: { type: "Named", name: "Stream" } },
  ]);

  expect(filters.filters.size).toBe(2);
});

test.each(["StmF", "StrF", "EFF"])("未定義の /%s はエラー", (key) => {
  expect(
    parseEncryption(standardEntries(4, 4, `/CF << >> /${key} /Missing`)).result,
  ).toMatchObject({
    ok: false,
    error: { code: "UNDEFINED_CRYPT_FILTER", key: `/${key}` },
  });
});

test.each([
  ["/CF << /StdCF 5 0 R >>", "INVALID_KEY_TYPE", "/CF/StdCF"],
  ["/CF << /StdCF << /CFM 5 0 R >> >>", "INVALID_KEY_TYPE", "/CF/StdCF/CFM"],
  [
    "/CF << /StdCF << /CFM /Unknown >> >>",
    "UNKNOWN_CRYPT_FILTER_METHOD",
    "/CF/StdCF/CFM",
  ],
  ["/CF << >> /StmF 5 0 R", "INVALID_KEY_TYPE", "/StmF"],
])("crypt filter の不正値 %s は %s とキー %s を報告する", (extra, code, key) => {
  expect(parseEncryption(standardEntries(4, 4, extra)).result).toMatchObject({
    ok: false,
    error: { code, key, offset: 7 },
  });
});
