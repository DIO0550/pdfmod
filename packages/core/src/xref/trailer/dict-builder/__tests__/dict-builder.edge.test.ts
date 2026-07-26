// 担当範囲: null オブジェクト（{ type: "null" }）の扱いにおける
// 必須フィールドとオプションフィールドの非対称、および offset 伝播とセッタの再代入挙動。
// 型不一致そのものの主担当は必須フィールドが validation、オプションフィールドが error。

import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import type { PdfValue } from "../../../../pdf/types/index";
import { trailerDictBuilder } from "../index";

const validRoot: PdfValue = {
  type: "indirect-ref",
  objectNumber: 1,
  generationNumber: 0,
};
const validSize: PdfValue = { type: "integer", value: 10 };
const nullValue: PdfValue = { type: "null" };

// オプション 5 フィールドの null は isPresent() が「不在」として扱う（ISO 32000-1 §7.3.9）。
// parseTrailer 経由の既存 test.each（parser.parsing.test.ts の
// 「/$keyがnullの場合は…」）が間接カバー済みだが、
// パーサのトークン解析に依存せず Builder 単体でも挙動を固定するために残す。

test("/Prev に null オブジェクトを渡すとキー不在として扱われ prev が未設定になる", () => {
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev(nullValue)
    .build();

  assert(result.ok);
  expect(result.value.prev).toBeUndefined();
});

test("/Info に null オブジェクトを渡すとキー不在として扱われ info が未設定になる", () => {
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info(nullValue)
    .build();

  assert(result.ok);
  expect(result.value.info).toBeUndefined();
});

test("/ID に null オブジェクトを渡すとキー不在として扱われ id が未設定になる", () => {
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id(nullValue)
    .build();

  assert(result.ok);
  expect(result.value.id).toBeUndefined();
});

test("/Encrypt に null オブジェクトを渡すとキー不在として扱われ暗号化なしと解釈される", () => {
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(nullValue)
    .build();

  assert(result.ok);
  expect(result.value.encrypt).toBeUndefined();
});

test("/XRefStm に null オブジェクトを渡すとキー不在として扱われ xrefStm が未設定になる", () => {
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm(nullValue)
    .build();

  assert(result.ok);
  expect(result.value.xrefStm).toBeUndefined();
});

test("/Root に null オブジェクトを渡すと不在ではなく型不一致として offset 付きで失敗する", () => {
  // 必須フィールドは isPresent() を通らないためオプションと非対称になる。
  // 未設定時（offset なし）ではなく「非 indirect-ref」分岐（offset あり）に落ちる
  const result = trailerDictBuilder()
    .root(nullValue, ByteOffset.of(11))
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBe(ByteOffset.of(11));
});

test("/Size に null オブジェクトを渡すと不在ではなく型不一致として offset 付きで失敗する", () => {
  // /Root と同じ非対称。!_size は null オブジェクトを truthy として通す
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(nullValue, ByteOffset.of(22))
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBe(ByteOffset.of(22));
});

test("セッタに offset を渡さずに検証を失敗させると error.offset が undefined になる", () => {
  // 呼び出し側（buildXRefStreamTrailerDict）が offset を渡さない実運用ケース
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: -1 })
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBeUndefined();
});

test("同じセッタを 2 回呼ぶと後に渡した値で検証される", () => {
  // Builder はクロージャ変数への再代入で値を保持するため後勝ちになる。
  // 1 回目の不正値が残っていれば失敗するはずのケース
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "integer", value: -1 })
    .size(validSize)
    .build();

  assert(result.ok);
  expect(result.value.size).toBe(10);
});

test("同じセッタを 2 回呼ぶと offset も後に渡した値で上書きされる", () => {
  // 値だけでなく offset も対で再代入される
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: -1 }, ByteOffset.of(33))
    .prev({ type: "integer", value: -1 }, ByteOffset.of(44))
    .build();

  assert(!result.ok);
  expect(result.error.offset).toBe(ByteOffset.of(44));
});
