import { assert, expect, test } from "vitest";
import { Predictor } from "../index";

test("DecodeParms未指定はデフォルト値（Predictor=1,Colors=1,BitsPerComponent=8,Columns=1）を返す", () => {
  const result = Predictor.parseParams(undefined);

  assert(result.ok);
  expect(result.value).toEqual({
    predictor: 1,
    colors: 1,
    bitsPerComponent: 8,
    columns: 1,
  });
});

test("DecodeParmsに/Predictor /Colors /BitsPerComponent /Columnsを指定すると値が反映される", () => {
  const decodeParms = new Map([
    ["Predictor", { type: "integer" as const, value: 12 }],
    ["Colors", { type: "integer" as const, value: 3 }],
    ["BitsPerComponent", { type: "integer" as const, value: 16 }],
    ["Columns", { type: "integer" as const, value: 5 }],
  ]);
  const result = Predictor.parseParams(decodeParms);

  assert(result.ok);
  expect(result.value).toEqual({
    predictor: 12,
    colors: 3,
    bitsPerComponent: 16,
    columns: 5,
  });
});

test("DecodeParmsに一部キーのみ指定した場合は未指定分がデフォルト値になる", () => {
  const decodeParms = new Map([
    ["Predictor", { type: "integer" as const, value: 2 }],
  ]);
  const result = Predictor.parseParams(decodeParms);

  assert(result.ok);
  expect(result.value).toEqual({
    predictor: 2,
    colors: 1,
    bitsPerComponent: 8,
    columns: 1,
  });
});

test("未サポートのPredictor値（3〜9）はXREF_STREAM_INVALIDエラーになる", () => {
  const data = new Uint8Array([0, 1, 2, 3]);
  const result = Predictor.apply(data, {
    predictor: 5,
    colors: 1,
    bitsPerComponent: 8,
    columns: 4,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("PNG予測子でデータ長がレコードサイズの倍数でない場合はXREF_STREAM_INVALIDエラーになる", () => {
  const data = new Uint8Array([2, 1, 1, 1]);
  const result = Predictor.apply(data, {
    predictor: 12,
    colors: 1,
    bitsPerComponent: 8,
    columns: 4,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("PNG予測子で未知のタグバイトが現れた場合はXREF_STREAM_INVALIDエラーになる", () => {
  const data = new Uint8Array([9, 1, 1, 1, 1]);
  const result = Predictor.apply(data, {
    predictor: 12,
    colors: 1,
    bitsPerComponent: 8,
    columns: 4,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("TIFF予測子（Predictor=2）でBitsPerComponentが8以外の場合はXREF_STREAM_INVALIDエラーになる", () => {
  const data = new Uint8Array([1, 2, 3, 4]);
  const result = Predictor.apply(data, {
    predictor: 2,
    colors: 1,
    bitsPerComponent: 4,
    columns: 4,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("TIFF予測子でデータ長が行バイト数の倍数でない場合はXREF_STREAM_INVALIDエラーになる", () => {
  const data = new Uint8Array([1, 2, 3]);
  const result = Predictor.apply(data, {
    predictor: 2,
    colors: 1,
    bitsPerComponent: 8,
    columns: 4,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});
