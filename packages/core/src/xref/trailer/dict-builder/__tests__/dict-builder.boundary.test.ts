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

test("/Root の objectNumber が 0 の場合は ROOT_NOT_FOUND を返す", () => {
  // 境界値: 0 は ISO 32000-1 §7.3.10 の正整数ではない（拒否側）。
  // 必須キーなのでカタログを解決できず、キー欠落と同じ扱いにする（#334）
  const result = trailerDictBuilder()
    .root({ type: "indirect-ref", objectNumber: 0, generationNumber: 0 })
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/Root の objectNumber が 1 の場合は Ok を返す", () => {
  // 境界値: 最小の有効なオブジェクト番号（許容側）
  const result = trailerDictBuilder()
    .root({ type: "indirect-ref", objectNumber: 1, generationNumber: 0 })
    .size(validSize)
    .build();

  assert(result.ok);
  expect(result.value.root.objectNumber).toBe(ObjectNumber.of(1));
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

test("/Encrypt の objectNumber が 0 の場合は非暗号化として正常終了する", () => {
  // 0 番参照は常に null に解決される（ISO 32000-1 §7.5.4）。/Encrypt は optional なので
  // 致命エラーにせず「キー無し」に正規化する（#334 / D-5b）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({ type: "indirect-ref", objectNumber: 0, generationNumber: 0 })
    .build();

  assert(result.ok);
  expect(result.value.encrypt).toBeUndefined();
});

test("/Info の objectNumber が 0 の場合は情報辞書なしとして正常終了する", () => {
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info({ type: "indirect-ref", objectNumber: 0, generationNumber: 0 })
    .build();

  assert(result.ok);
  expect(result.value.info).toBeUndefined();
});

test.each([
  { key: "info" as const, label: "/Info" },
  { key: "encrypt" as const, label: "/Encrypt" },
])("$label の objectNumber が 0 でも世代番号が範囲外なら TRAILER_DICT_INVALID を返す", ({
  key,
}) => {
  // 0 判定を世代番号の検証より先に置くと、範囲外の世代番号まで正常終了してしまう。
  // その順序回帰を固定する（#334 / D-5b）
  const builder = trailerDictBuilder().root(validRoot).size(validSize);
  const result = builder[key]({
    type: "indirect-ref",
    objectNumber: 0,
    generationNumber: MAX_GENERATION_NUMBER + 1,
  }).build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
});

// /Prev と /XRefStm は間接参照ではなく xref セクションへのバイトオフセットなので、
// 0 G R を null に畳んではならない。畳むと mergeXRefChain のチェーン走査が途中で
// 正常終了し、古い revision のオブジェクトが黙って消える（silent data loss）。
// そのため従来どおり TRAILER_DICT_INVALID を維持する（#334 / D-5b）。
test.each([
  { key: "prev" as const, label: "/Prev" },
  { key: "xrefStm" as const, label: "/XRefStm" },
])("$label に 0 G R を与えると TRAILER_DICT_INVALID のままである", ({
  key,
}) => {
  const builder = trailerDictBuilder().root(validRoot).size(validSize);
  const result = builder[key]({
    type: "indirect-ref",
    objectNumber: 0,
    generationNumber: 0,
  }).build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
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
