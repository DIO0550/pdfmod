import { assert, expect, test } from "vitest";
import { PdfFilter } from "../index";

test("LZW の既知の符号列を MSB 順で展開する", async () => {
  // ISO 32000-1 §7.4.4.2: 256,45,258,258,65,259,66,257
  const data = new Uint8Array([128, 11, 96, 80, 34, 12, 12, 133, 1]);
  const result = await PdfFilter.decode(data, "LZWDecode");
  assert(result.ok);
  expect(result.value).toEqual(
    new Uint8Array([45, 45, 45, 45, 45, 65, 45, 45, 45, 66]),
  );
});

test("LZW の ClearTable と EOD だけなら空のバイト列を返す", async () => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 64, 64]),
    "LZWDecode",
  );
  expect(result).toEqual({ ok: true, value: new Uint8Array() });
});

test("LZW の EOD 後のパディングと末尾データを読み捨てる", async () => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 16, 96, 63, 255]),
    "LZWDecode",
  );
  expect(result).toEqual({ ok: true, value: new Uint8Array([65]) });
});

test("LZW の次の未登録コードは直前の文字列とその先頭文字から復元する", async () => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 16, 96, 80, 16]),
    "LZWDecode",
  );
  expect(result).toEqual({ ok: true, value: new Uint8Array([65, 65, 65]) });
});

test("/Filter に LZWDecode を指定できる", () => {
  const result = PdfFilter.parse(
    new Map([["Filter", { type: "name", value: "LZWDecode" }]]),
  );
  expect(result).toEqual({ ok: true, value: "LZWDecode" });
});

test("/Filter に単一要素の LZWDecode 配列を指定できる", () => {
  const result = PdfFilter.parse(
    new Map([
      [
        "Filter",
        {
          type: "array",
          elements: [{ type: "name", value: "LZWDecode" }],
        },
      ],
    ]),
  );
  expect(result).toEqual({ ok: true, value: "LZWDecode" });
});

test("先頭の ClearTable が省略された LZW は初期辞書で展開する", async () => {
  const result = await PdfFilter.decode(
    new Uint8Array([32, 192, 64]),
    "LZWDecode",
  );
  expect(result).toEqual({ ok: true, value: new Uint8Array([65]) });
});
