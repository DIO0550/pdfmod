import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { ObjectParser } from "../../../object-parser/index";
import { ObjectStreamBody } from "../index";

test("LZW 圧縮の ObjStm から指定番号のオブジェクトを抽出する", async () => {
  const compressed = new Uint8Array([
    128, 12, 70, 2, 1, 128, 128, 232, 114, 58, 153, 96, 32,
  ]);
  const header = new TextEncoder().encode(
    `15 0 obj\n<< /Type /ObjStm /Filter /LZWDecode /N 1 /First 5 /Length ${compressed.length} >>\nstream\n`,
  );
  const footer = new TextEncoder().encode("\nendstream\nendobj\n");
  const data = new Uint8Array(
    header.length + compressed.length + footer.length,
  );
  data.set(header);
  data.set(compressed, header.length);
  data.set(footer, header.length + compressed.length);
  const parsed = await ObjectParser.parseIndirectObject(data, ByteOffset.of(0));
  assert(parsed.ok);
  assert(parsed.value.body.type === "stream");

  const result = await ObjectStreamBody.extract({
    stream: parsed.value.body,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(10),
    indexInStream: 0,
  });

  expect(result).toEqual({ ok: true, value: { type: "boolean", value: true } });
});
