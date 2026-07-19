import { assert, expect, test } from "vitest";
import { Predictor } from "../index";

const defaultParams = {
  predictor: 1,
  colors: 1,
  bitsPerComponent: 8,
  columns: 4,
};

test("Predictor=1（予測子なし）はデータをそのまま返す", () => {
  const data = new Uint8Array([1, 2, 3, 4]);
  const result = Predictor.apply(data, defaultParams);

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([1, 2, 3, 4]);
});

test("Predictor=12（PNG Up）は各バイトに直上行の同位置バイトを加算して復元する", () => {
  // tag=2(Up) の2行: row0=[10,20,30,40](上行なしなので加算0), row1=[1,1,1,1](上行を加算)
  const data = new Uint8Array([2, 10, 20, 30, 40, 2, 1, 1, 1, 1]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 12 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([10, 20, 30, 40, 11, 21, 31, 41]);
});

test("Predictor=10（PNG None）はタグバイトを除去するだけで値は変えない", () => {
  const data = new Uint8Array([0, 5, 6, 7, 8]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 10 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([5, 6, 7, 8]);
});

test("Predictor=11（PNG Sub）は同行内の左バイトを加算して復元する", () => {
  const data = new Uint8Array([1, 5, 3, 3, 3]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 11 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([5, 8, 11, 14]);
});

test("Predictor=13（PNG Average）は左と直上の平均（切り捨て）を加算して復元する", () => {
  const data = new Uint8Array([3, 10, 10, 10, 10]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 13 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([10, 15, 17, 18]);
});

test("Predictor=14（PNG Paeth）はPaeth予測子で選んだ近傍値を加算して復元する", () => {
  const data = new Uint8Array([4, 7, 7, 7, 7]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 14 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([7, 14, 21, 28]);
});

test("Predictor=12で複数行を跨いで直上値が正しく引き継がれる（3行）", () => {
  const data = new Uint8Array([2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 12 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([
    1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
  ]);
});

test("Predictor=12は255を超える加算を256でラップする", () => {
  const data = new Uint8Array([2, 200, 2, 100]);
  const result = Predictor.apply(data, {
    predictor: 12,
    colors: 1,
    bitsPerComponent: 8,
    columns: 1,
  });

  assert(result.ok);
  // row0 = 200, row1 = (100 + 200) % 256 = 44
  expect(Array.from(result.value)).toEqual([200, 44]);
});

test("Predictor=2（TIFF）はColors=1のとき左バイトを加算して復元する", () => {
  const data = new Uint8Array([10, 5, 5, 5]);
  const result = Predictor.apply(data, { ...defaultParams, predictor: 2 });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([10, 15, 20, 25]);
});

test("Predictor=2（TIFF）はColors=2のとき同一チャンネルの左ピクセルを加算して復元する", () => {
  const data = new Uint8Array([10, 20, 5, 5]);
  const result = Predictor.apply(data, {
    predictor: 2,
    colors: 2,
    bitsPerComponent: 8,
    columns: 2,
  });

  assert(result.ok);
  expect(Array.from(result.value)).toEqual([10, 20, 15, 25]);
});
