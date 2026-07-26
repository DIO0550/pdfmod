// 担当範囲: 数値の境界値（0 / 65535 / 65536 / MAX_SAFE_INTEGER / +1）。
// 許容側と拒否側を必ずペアで書き、どこで切り替わるかを固定する。
// 必須フィールドの型不一致は validation、オプションフィールドの型不一致は error を参照。

import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import type { PdfValue } from "../../../../pdf/types/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { trailerDictBuilder } from "../index";

const validRoot: PdfValue = {
  type: "indirect-ref",
  objectNumber: 1,
  generationNumber: 0,
};
const validSize: PdfValue = { type: "integer", value: 10 };

const MAX_GENERATION_NUMBER = 65535;

test("/Root の objectNumber が 0 の場合は Ok を返す", () => {
  // 境界値: 最小の有効なオブジェクト番号（許容側）
  const result = trailerDictBuilder()
    .root({ type: "indirect-ref", objectNumber: 0, generationNumber: 0 })
    .size(validSize)
    .build();

  assert(result.ok);
  expect(result.value.root.objectNumber).toBe(ObjectNumber.of(0));
});

test("/Root の objectNumber が MAX_SAFE_INTEGER の場合は Ok を返す", () => {
  // 境界値: safe integer 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root({
      type: "indirect-ref",
      objectNumber: Number.MAX_SAFE_INTEGER,
      generationNumber: 0,
    })
    .size(validSize)
    .build();

  assert(result.ok);
  expect(result.value.root.objectNumber).toBe(
    ObjectNumber.of(Number.MAX_SAFE_INTEGER),
  );
});

test("/Root の objectNumber が MAX_SAFE_INTEGER + 1 の場合は ROOT_NOT_FOUND を返す", () => {
  // 境界値: safe integer 超過（拒否側）
  const result = trailerDictBuilder()
    .root({
      type: "indirect-ref",
      objectNumber: Number.MAX_SAFE_INTEGER + 1,
      generationNumber: 0,
    })
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/Root の generationNumber が 0 の場合は Ok を返す", () => {
  // 境界値: generation の下限（許容側）
  const result = trailerDictBuilder()
    .root({ type: "indirect-ref", objectNumber: 1, generationNumber: 0 })
    .size(validSize)
    .build();

  assert(result.ok);
  expect(result.value.root.generationNumber).toBe(GenerationNumber.of(0));
});

test("/Root の generationNumber が 65535 の場合は Ok を返す", () => {
  // 境界値: GenerationNumber.create の上限そのもの（許容側）
  const result = trailerDictBuilder()
    .root({
      type: "indirect-ref",
      objectNumber: 1,
      generationNumber: MAX_GENERATION_NUMBER,
    })
    .size(validSize)
    .build();

  assert(result.ok);
  expect(result.value.root.generationNumber).toBe(
    GenerationNumber.of(MAX_GENERATION_NUMBER),
  );
});

test("/Root の generationNumber が 65536 の場合は ROOT_NOT_FOUND を返す", () => {
  // 境界値: GenerationNumber.create の範囲外（拒否側）。
  // isSafeIntegerAtLeastZero ガードは通り、create だけが落とす唯一の帯域
  const result = trailerDictBuilder()
    .root({
      type: "indirect-ref",
      objectNumber: 1,
      generationNumber: MAX_GENERATION_NUMBER + 1,
    })
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/Size が 0 の場合は Ok を返す", () => {
  // 境界値: 空の xref を示す最小値（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "integer", value: 0 })
    .build();

  assert(result.ok);
  expect(result.value.size).toBe(0);
});

test("/Size が MAX_SAFE_INTEGER の場合は Ok を返す", () => {
  // 境界値: safe integer 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "integer", value: Number.MAX_SAFE_INTEGER })
    .build();

  assert(result.ok);
  expect(result.value.size).toBe(Number.MAX_SAFE_INTEGER);
});

test("/Size が MAX_SAFE_INTEGER + 1 の場合は SIZE_NOT_FOUND を返す", () => {
  // 境界値: safe integer 超過（拒否側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "integer", value: Number.MAX_SAFE_INTEGER + 1 })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
});

test("/Prev が 0 の場合は Ok を返す", () => {
  // 境界値: ファイル先頭を指す前世代 xref オフセット（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: 0 })
    .build();

  assert(result.ok);
  expect(result.value.prev).toBe(ByteOffset.of(0));
});

test("/Prev が MAX_SAFE_INTEGER の場合は Ok を返す", () => {
  // 境界値: 巨大オフセット（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: Number.MAX_SAFE_INTEGER })
    .build();

  assert(result.ok);
  expect(result.value.prev).toBe(ByteOffset.of(Number.MAX_SAFE_INTEGER));
});

test("/Prev が MAX_SAFE_INTEGER + 1 の場合は TRAILER_DICT_INVALID を返す", () => {
  // 境界値: safe integer 超過（拒否側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: Number.MAX_SAFE_INTEGER + 1 })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
});

test("/XRefStm が 0 の場合は Ok を返す", () => {
  // 境界値: ハイブリッド参照で先頭を指す（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "integer", value: 0 })
    .build();

  assert(result.ok);
  expect(result.value.xrefStm).toBe(ByteOffset.of(0));
});

test("/XRefStm が MAX_SAFE_INTEGER の場合は Ok を返す", () => {
  // 境界値: safe integer 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "integer", value: Number.MAX_SAFE_INTEGER })
    .build();

  assert(result.ok);
  expect(result.value.xrefStm).toBe(ByteOffset.of(Number.MAX_SAFE_INTEGER));
});

test("/XRefStm が MAX_SAFE_INTEGER + 1 の場合は TRAILER_DICT_INVALID を返す", () => {
  // 境界値: safe integer 超過（拒否側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "integer", value: Number.MAX_SAFE_INTEGER + 1 })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
});

test("/Info の objectNumber が MAX_SAFE_INTEGER の場合は Ok を返す", () => {
  // 境界値: safe integer 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info({
      type: "indirect-ref",
      objectNumber: Number.MAX_SAFE_INTEGER,
      generationNumber: 0,
    })
    .build();

  assert(result.ok);
  expect(result.value.info?.objectNumber).toBe(
    ObjectNumber.of(Number.MAX_SAFE_INTEGER),
  );
});

test("/Info の objectNumber が MAX_SAFE_INTEGER + 1 の場合は TRAILER_DICT_INVALID を返す", () => {
  // 境界値: safe integer 超過（拒否側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info({
      type: "indirect-ref",
      objectNumber: Number.MAX_SAFE_INTEGER + 1,
      generationNumber: 0,
    })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
});

test("/Info の generationNumber が 65535 の場合は Ok を返す", () => {
  // 境界値: generation 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info({
      type: "indirect-ref",
      objectNumber: 2,
      generationNumber: MAX_GENERATION_NUMBER,
    })
    .build();

  assert(result.ok);
  expect(result.value.info?.generationNumber).toBe(
    GenerationNumber.of(MAX_GENERATION_NUMBER),
  );
});

test("/Info の generationNumber が 65536 の場合は TRAILER_DICT_INVALID を返す", () => {
  // 境界値: generation 上限超過（拒否側）。
  // isSafeIntegerAtLeastZero ガードは通り、create だけが落とす唯一の帯域
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info({
      type: "indirect-ref",
      objectNumber: 2,
      generationNumber: MAX_GENERATION_NUMBER + 1,
    })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
});

test("/Encrypt の objectNumber が 0 の場合は Ok を返す", () => {
  // 境界値: 最小の有効なオブジェクト番号（許容側）。拒否側は error を参照
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({ type: "indirect-ref", objectNumber: 0, generationNumber: 0 })
    .build();

  assert(result.ok);
  expect(result.value.encrypt).toEqual({
    objectNumber: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Encrypt の objectNumber が MAX_SAFE_INTEGER の場合は Ok を返す", () => {
  // 境界値: safe integer 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({
      type: "indirect-ref",
      objectNumber: Number.MAX_SAFE_INTEGER,
      generationNumber: 0,
    })
    .build();

  assert(result.ok);
  expect(result.value.encrypt).toEqual({
    objectNumber: ObjectNumber.of(Number.MAX_SAFE_INTEGER),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Encrypt の generationNumber が 65535 の場合は Ok を返す", () => {
  // 境界値: 暗号化辞書参照の generation 上限ちょうど（許容側）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({
      type: "indirect-ref",
      objectNumber: 3,
      generationNumber: MAX_GENERATION_NUMBER,
    })
    .build();

  assert(result.ok);
  expect(result.value.encrypt).toEqual({
    objectNumber: ObjectNumber.of(3),
    generationNumber: GenerationNumber.of(MAX_GENERATION_NUMBER),
  });
});

test("/Encrypt の generationNumber が 65536 の場合は TRAILER_DICT_INVALID を返す", () => {
  // 境界値: generation 上限超過（拒否側）。
  // isSafeIntegerAtLeastZero ガードは通り、create だけが落とす唯一の帯域
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({
      type: "indirect-ref",
      objectNumber: 3,
      generationNumber: MAX_GENERATION_NUMBER + 1,
    })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
});
