import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { parseXRefStream } from "../index";

test.each([
  0, 1,
])("LZW と PNG Up の XRef ストリームを EarlyChange=%i で展開する", async (earlyChange) => {
  const compressed = new Uint8Array([
    128, 0, 128, 0, 0, 0, 0, 4, 1, 0, 25, 0, 16, 16,
  ]);
  const header = new TextEncoder().encode(
    "1 0 obj\n<< /Type /XRef /Filter /LZWDecode " +
      `/DecodeParms << /EarlyChange ${earlyChange} /Predictor 12 /Columns 4 >> ` +
      `/W [1 2 1] /Size 2 /Root 2 0 R /Length ${compressed.length} >>\nstream\n`,
  );
  const footer = new TextEncoder().encode("\nendstream\nendobj\n");
  const data = new Uint8Array(
    header.length + compressed.length + footer.length,
  );
  data.set(header);
  data.set(compressed, header.length);
  data.set(footer, header.length + compressed.length);

  const result = await parseXRefStream(data, ByteOffset.of(0));

  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toMatchObject({
    type: 1,
    offset: 100,
  });
});

test("LZW の XRef ストリームに FlateDecode と同じ TIFF Predictor を適用する", async () => {
  const compressed = new Uint8Array([
    128, 0, 64, 0, 0, 0, 5, 254, 100, 78, 64, 64,
  ]);
  const header = new TextEncoder().encode(
    "1 0 obj\n<< /Type /XRef /Filter [/LZWDecode] " +
      "/DecodeParms << /Predictor 2 /Columns 4 >> " +
      `/W [1 2 1] /Size 3 /Index [1 2] /Root 2 0 R /Length ${compressed.length} >>\nstream\n`,
  );
  const footer = new TextEncoder().encode("\nendstream\nendobj\n");
  const data = new Uint8Array(
    header.length + compressed.length + footer.length,
  );
  data.set(header);
  data.set(compressed, header.length);
  data.set(footer, header.length + compressed.length);

  const result = await parseXRefStream(data, ByteOffset.of(0));

  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(2))).toMatchObject({
    type: 1,
    offset: 100,
  });
});
