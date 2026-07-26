// 担当範囲: オプションフィールド /Prev・/XRefStm・/Info・/ID・/Encrypt の異常系。
// いずれも TRAILER_DICT_INVALID（呼び出し側が文脈別コードに書き換える前の生コード）を返す。
// 必須フィールドの異常系は validation、境界値は boundary を参照。

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

// フィールドごとに別の offset を渡し、どのフィールドの offset が伝播したかを識別する
const PREV_OFFSET = ByteOffset.of(55);
const XREF_STM_OFFSET = ByteOffset.of(66);
const INFO_OFFSET = ByteOffset.of(77);
const ID_OFFSET = ByteOffset.of(88);
const ENCRYPT_OFFSET = ByteOffset.of(99);

test("/Prev が real 型で値が非負 safe integer（10）の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Prev 10.0`。短絡評価の第 1 項 `_prev.type !== "integer"` を単独で踏む
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "real", value: 10 }, PREV_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(PREV_OFFSET);
});

test("/Prev が real 型で値も非整数（1.5）の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Prev 1.5` の不正 PDF
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "real", value: 1.5 }, PREV_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(PREV_OFFSET);
});

test("/Prev が integer で -1 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Prev -1`。短絡評価の第 2 項（isSafeIntegerAtLeastZero）側
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: -1 }, PREV_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(PREV_OFFSET);
});

test("/Prev が integer だが NaN の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: NaN }, PREV_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(PREV_OFFSET);
});

test("/XRefStm が real 型で値が非負 safe integer（10）の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: ハイブリッド参照 PDF の `/XRefStm 10.0`。
  // 短絡評価の第 1 項を単独で踏む。xref ストリーム経路からは到達不能な分岐
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "real", value: 10 }, XREF_STM_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(XREF_STM_OFFSET);
});

test("/XRefStm が real 型で値も非整数（1.5）の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/XRefStm 1.5`
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "real", value: 1.5 }, XREF_STM_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(XREF_STM_OFFSET);
});

test("/XRefStm が integer で -1 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/XRefStm -1`。短絡評価の第 2 項側
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "integer", value: -1 }, XREF_STM_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(XREF_STM_OFFSET);
});

test("/Info が indirect-ref 以外（dictionary）の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Info << … >>` のように直接辞書が書かれた PDF
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info(
      { type: "dictionary", entries: new Map<string, PdfValue>() },
      INFO_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(INFO_OFFSET);
});

test("/Info の objectNumber が -1 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Info -1 0 R`。既存の間接テストは MAX_SAFE 超のみで負値は未到達
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info(
      { type: "indirect-ref", objectNumber: -1, generationNumber: 0 },
      INFO_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(INFO_OFFSET);
});

test("/Info の objectNumber が NaN の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info(
      { type: "indirect-ref", objectNumber: NaN, generationNumber: 0 },
      INFO_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(INFO_OFFSET);
});

test.each([
  -1,
  1.5,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])("/Info の generationNumber が %s の場合に TRAILER_DICT_INVALID と offset を返す", (invalid) => {
  // 異常系: 既存の間接テストが踏んでいない不正 generation 値。
  // どの不正値でも TRAILER_DICT_INVALID を返すという契約の固定が目的
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info(
      { type: "indirect-ref", objectNumber: 2, generationNumber: invalid },
      INFO_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(INFO_OFFSET);
});

test("/Info の generationNumber が NaN の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info(
      { type: "indirect-ref", objectNumber: 2, generationNumber: NaN },
      INFO_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(INFO_OFFSET);
});

test("/ID が array 以外（string）の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/ID (abc)` の不正 PDF。要素数チェックより手前の分岐
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id(
      { type: "string", value: new Uint8Array([0x01]), encoding: "literal" },
      ID_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ID_OFFSET);
});

test("/ID の要素数が 1 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: 片方の ID しか書かれていない PDF
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id(
      {
        type: "array",
        elements: [
          { type: "string", value: new Uint8Array([0x01]), encoding: "hex" },
        ],
      },
      ID_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ID_OFFSET);
});

test("/ID の要素数が 3 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: 要素数超過
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id(
      {
        type: "array",
        elements: [
          { type: "string", value: new Uint8Array([0x01]), encoding: "hex" },
          { type: "string", value: new Uint8Array([0x02]), encoding: "hex" },
          { type: "string", value: new Uint8Array([0x03]), encoding: "hex" },
        ],
      },
      ID_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ID_OFFSET);
});

test("/ID の第 1 要素が string 以外の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/ID [1 2]` 相当のループ i=0 側の分岐。
  // parser.error.test.ts が間接カバー済みだが Builder 単体で再固定する
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id(
      {
        type: "array",
        elements: [
          { type: "integer", value: 1 },
          { type: "string", value: new Uint8Array([0x02]), encoding: "hex" },
        ],
      },
      ID_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ID_OFFSET);
});

test("/ID の第 2 要素のみが string 以外の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: ループ i=1 側の実行パス。
  // 既存の間接テストは両要素とも非 string のため i=1 のイテレーションを通っていない
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id(
      {
        type: "array",
        elements: [
          { type: "string", value: new Uint8Array([0x01]), encoding: "hex" },
          { type: "integer", value: 2 },
        ],
      },
      ID_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ID_OFFSET);
});

test("/Encrypt の objectNumber が -1 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Encrypt -1 0 R`。
  // 暗号化 PDF のすり抜け防止に直結する indirect-ref 側の数値検証
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(
      { type: "indirect-ref", objectNumber: -1, generationNumber: 0 },
      ENCRYPT_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});

test("/Encrypt の objectNumber が MAX_SAFE_INTEGER + 1 の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: 数値破損した参照
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(
      {
        type: "indirect-ref",
        objectNumber: Number.MAX_SAFE_INTEGER + 1,
        generationNumber: 0,
      },
      ENCRYPT_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});

test("/Encrypt の objectNumber が NaN の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(
      { type: "indirect-ref", objectNumber: NaN, generationNumber: 0 },
      ENCRYPT_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});

test.each([
  -1,
  1.5,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])("/Encrypt の generationNumber が %s の場合に TRAILER_DICT_INVALID と offset を返す", (invalid) => {
  // 異常系: `/Encrypt 3 -1 R` など。
  // どの不正値でも TRAILER_DICT_INVALID を返すという契約の固定が目的
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(
      { type: "indirect-ref", objectNumber: 3, generationNumber: invalid },
      ENCRYPT_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});

test("/Encrypt の generationNumber が NaN の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(
      { type: "indirect-ref", objectNumber: 3, generationNumber: NaN },
      ENCRYPT_OFFSET,
    )
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});

test("/Encrypt が name 型の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: `/Encrypt /Standard` の不正 PDF。
  // indirect-ref でも dictionary でもない else 分岐
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({ type: "name", value: "Standard" }, ENCRYPT_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});

test("/Encrypt が array 型の場合に TRAILER_DICT_INVALID と offset を返す", () => {
  // 異常系: 型不一致のバリエーション
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({ type: "array", elements: [] }, ENCRYPT_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("TRAILER_DICT_INVALID");
  expect(result.error.offset).toBe(ENCRYPT_OFFSET);
});
