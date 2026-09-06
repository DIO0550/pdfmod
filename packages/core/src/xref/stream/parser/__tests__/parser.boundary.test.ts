import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { decodeXRefStreamEntries } from "../index";

// /W [1 2 2] / /Size 3 / /Index 省略（既定値 [0, 3]）を模した 3 エントリ分のバイト列。
// entry0: type=0 フリーリスト先頭 / entry1: type=1 offset 17 / entry2: type=2 ObjStm 1 の 0 番目
const INDEX_OMITTED_DATA = new Uint8Array([
  0x00, 0x00, 0x00, 0xff, 0xff, 0x01, 0x00, 0x11, 0x00, 0x00, 0x02, 0x00, 0x01,
  0x00, 0x00,
]);

test("/Index 省略時の 0 番エントリは登録されず後続エントリのデコードもずれない", () => {
  const result = decodeXRefStreamEntries({
    data: INDEX_OMITTED_DATA,
    w: [1, 2, 2],
    size: 3,
  });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toBeUndefined();
  expect(result.value.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(17),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(2))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(1),
    indexInStream: 0,
  });
  expect(result.value.size).toBe(3);
  expect(result.value.entries.size).toBe(2);
});

test("type=2 の streamObject が 0 のとき XREF_STREAM_INVALID になる", () => {
  const data = new Uint8Array([
    0x00, 0x00, 0x00, 0xff, 0xff, 0x01, 0x00, 0x11, 0x00, 0x00, 0x02, 0x00,
    0x00, 0x00, 0x00,
  ]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 2], size: 3 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});
