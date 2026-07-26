// 担当範囲: trailerDictBuilder().build() の正常系（成功パス）。
// 必須・オプションの各フィールドが TrailerDict に正しくマッピングされることを検証する。
// 異常系は必須フィールドが validation、オプションフィールドが error を参照。

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

test("/Root と /Size のみを設定した最小構成で TrailerDict を返す", () => {
  // 正常系: 必須 2 フィールドのみ。オプションは result に現れない
  const result = trailerDictBuilder().root(validRoot).size(validSize).build();

  assert(result.ok);
  expect(result.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.size).toBe(10);
  expect(result.value.prev).toBeUndefined();
  expect(result.value.info).toBeUndefined();
  expect(result.value.id).toBeUndefined();
  expect(result.value.encrypt).toBeUndefined();
  expect(result.value.xrefStm).toBeUndefined();
});

test("/XRefStm を含む全フィールドを設定した場合に全項目が TrailerDict に載る", () => {
  // 正常系: xref ストリーム経路からは到達不能な全部入りパス
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: 512 })
    .info({ type: "indirect-ref", objectNumber: 2, generationNumber: 0 })
    .id({
      type: "array",
      elements: [
        { type: "string", value: new Uint8Array([0x01]), encoding: "hex" },
        { type: "string", value: new Uint8Array([0x02]), encoding: "hex" },
      ],
    })
    .encrypt({ type: "indirect-ref", objectNumber: 3, generationNumber: 0 })
    .xrefStm({ type: "integer", value: 1024 })
    .build();

  assert(result.ok);
  expect(result.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.size).toBe(10);
  expect(result.value.prev).toBe(ByteOffset.of(512));
  expect(result.value.info).toEqual({
    objectNumber: ObjectNumber.of(2),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.id?.[0]).toEqual(new Uint8Array([0x01]));
  expect(result.value.id?.[1]).toEqual(new Uint8Array([0x02]));
  expect(result.value.encrypt).toEqual({
    objectNumber: ObjectNumber.of(3),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xrefStm).toBe(ByteOffset.of(1024));
});

test("/Prev のみを追加設定した場合に prev が ByteOffset として載る", () => {
  // 正常系: 増分更新 PDF で前世代 xref のオフセットが存在するケース
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .prev({ type: "integer", value: 512 })
    .build();

  assert(result.ok);
  expect(result.value.prev).toBe(ByteOffset.of(512));
});

test("/XRefStm のみを追加設定した場合に xrefStm が ByteOffset として載る", () => {
  // 正常系: ハイブリッド参照 PDF。
  // 呼び出し側の xref ストリーム経路は .xrefStm() を呼ばないため到達不能
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .xrefStm({ type: "integer", value: 1024 })
    .build();

  assert(result.ok);
  expect(result.value.xrefStm).toBe(ByteOffset.of(1024));
});

test("/ID のみを追加設定した場合に 2 要素の Uint8Array 組が id に載る", () => {
  // 正常系: 文書 ID を持つ PDF
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .id({
      type: "array",
      elements: [
        { type: "string", value: new Uint8Array([0xab]), encoding: "hex" },
        { type: "string", value: new Uint8Array([0xcd]), encoding: "hex" },
      ],
    })
    .build();

  assert(result.ok);
  expect(result.value.id?.[0]).toEqual(new Uint8Array([0xab]));
  expect(result.value.id?.[1]).toEqual(new Uint8Array([0xcd]));
});

test("/Info のみを追加設定した場合に info が間接参照として載る", () => {
  // 正常系: 文書情報辞書への間接参照を持つ PDF
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .info({ type: "indirect-ref", objectNumber: 2, generationNumber: 3 })
    .build();

  assert(result.ok);
  expect(result.value.info).toEqual({
    objectNumber: ObjectNumber.of(2),
    generationNumber: GenerationNumber.of(3),
  });
});

test("/Encrypt が indirect-ref の場合に encrypt が間接参照として載る", () => {
  // 正常系: 暗号化辞書を間接参照で持つ標準的な暗号化 PDF
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt({ type: "indirect-ref", objectNumber: 5, generationNumber: 0 })
    .build();

  assert(result.ok);
  expect(result.value.encrypt).toEqual({
    objectNumber: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Encrypt が dictionary の場合に辞書をそのまま encrypt に格納する", () => {
  // 正常系: dictionary バリアント。
  // parseTrailer 経由の既存テスト（parser.parsing.test.ts の
  // 「/Encryptが直接辞書として与えられた場合にPdfDictionaryとして抽出される」）が
  // 間接カバー済みだが、Builder 直接呼び出しでも同じ挙動になることを固定する
  const encryptDict: PdfValue = {
    type: "dictionary",
    entries: new Map<string, PdfValue>([
      ["Filter", { type: "name", value: "Standard" }],
      ["V", { type: "integer", value: 2 }],
    ]),
  };
  const result = trailerDictBuilder()
    .root(validRoot)
    .size(validSize)
    .encrypt(encryptDict)
    .build();

  assert(result.ok);
  // 参照同一性まで固定する。toEqual だけだと「同値の別オブジェクトへコピーする」
  // 実装変更を検出できず、パススルーであることを保証できない
  expect(result.value.encrypt).toBe(encryptDict);
});
