import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../../content-stream/graphics-state/index";
import { ContentStreamInterpreter } from "../../../content-stream/interpreter/index";
import { ObjectParser } from "../../../objects/object-parser/index";
import { ObjectStore } from "../../../objects/object-store/index";
import {
  ByteOffset,
  GenerationNumber,
  ObjectNumber,
  type ResolveRef,
  type XRefEntry,
} from "../../../pdf/types/index";
import { none } from "../../../utils/option/index";
import { ok } from "../../../utils/result/index";
import { PdfResources } from "../index";

const FontBody = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

/**
 * 実バイト列からリソース辞書と間接オブジェクトストアを準備する。
 * @param source - リソース辞書のPDF記述と、1番から順に配置するオブジェクト本体
 * @returns リソース辞書と実ストアを使った参照解決関数
 */
function setup(source: {
  readonly resources: string;
  readonly objects?: readonly string[];
}): { readonly resources: PdfResources; readonly resolveRef: ResolveRef } {
  const objects = (source.objects ?? []).map(
    (body, index) => `${index + 1} 0 obj\n${body}\nendobj\n`,
  );
  const entries = objects.map((_, index): [ObjectNumber, XRefEntry] => [
    ObjectNumber.of(index + 1),
    {
      type: 1,
      offset: ByteOffset.of(objects.slice(0, index).join("").length),
      generationNumber: GenerationNumber.of(0),
    },
  ]);
  const store = ObjectStore.create({
    data: new TextEncoder().encode(objects.join("")),
    xref: { entries: new Map(entries), size: objects.length + 1 },
  });
  assert(store.ok);

  const parsed = ObjectParser.parse(
    new TextEncoder().encode(source.resources),
    ByteOffset.of(0),
  );
  assert(parsed.ok);
  assert(parsed.value.type === "dictionary");

  return {
    resources: PdfResources.from(parsed.value),
    resolveRef: (ref) => store.value.get(ref),
  };
}

test.each([
  { resources: `<< /Font << /F1 ${FontBody} >> >>` },
  { resources: `<< /Font 1 0 R >>`, objects: [`<< /F1 ${FontBody} >>`] },
  { resources: "<< /Font << /F1 1 0 R >> >>", objects: [FontBody] },
  { resources: "<< /Font 1 0 R >>", objects: ["<< /F1 2 0 R >>", FontBody] },
])("/Font とフォント辞書の直値・間接参照を解決できる: $resources", async (source) => {
  const { resources, resolveRef } = setup(source);

  const result = await PdfResources.getFont(resources, "F1", resolveRef);

  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value.entries.get("BaseFont")).toEqual({
    type: "name",
    value: "Helvetica",
  });
});

test.each([
  { resources: `<< /Font << /F2 ${FontBody} >> >>` },
  { resources: "<< >>" },
  { resources: "<< /Font 42 >>" },
  { resources: "<< /Font 1 0 R >>", objects: ["42"] },
  { resources: "<< /Font << /F1 42 >> >>" },
  { resources: "<< /Font << /F1 1 0 R >> >>", objects: ["42"] },
  { resources: "<< /Font << /F1 null >> >>" },
  { resources: "<< /Font << /F1 99 0 R >> >>" },
  {
    resources: "<< /Font << /F1 1 0 R >> >>",
    objects: ["<< /Length 0 >>\nstream\n\nendstream"],
  },
])("名前がない、または辞書でないフォントは未解決になる: $resources", async (source) => {
  const { resources, resolveRef } = setup(source);

  const result = await PdfResources.getFont(resources, "F1", resolveRef);

  expect(result).toEqual(ok(none));
});

test.each([
  "<< /Font 1 0 R >>",
  "<< /Font << /F1 1 0 R >> >>",
])("参照先の構文不正は未解決として握りつぶさない: %s", async (source) => {
  const { resources, resolveRef } = setup({
    resources: source,
    objects: ["<< /Broken >>"],
  });

  const result = await PdfResources.getFont(resources, "F1", resolveRef);

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("Tf が保持した名前からフォント辞書へ到達できる", async () => {
  const { resources, resolveRef } = setup({
    resources: "<< /Font 1 0 R >>",
    objects: ["<< /F1 2 0 R >>", FontBody],
  });
  const executed = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode("BT /F#31 12 Tf ET"),
  });
  assert(executed.ok);
  const { textState } = GraphicsStateStack.current(
    executed.value.context.graphicsStateStack,
  );
  assert(textState.fontName.some);

  const result = await PdfResources.getFont(
    resources,
    textState.fontName.value,
    resolveRef,
  );

  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value.entries.get("BaseFont")).toEqual({
    type: "name",
    value: "Helvetica",
  });
  expect(textState.fontSize).toBe(12);
});

test("未知フォントへ切り替えても Tf の名前・サイズと他のテキスト状態を保つ", async () => {
  const { resources, resolveRef } = setup({
    resources: `<< /Font << /F1 ${FontBody} >> >>`,
  });
  const executed = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode(
      "BT 2 Tc 3 Tw 80 Tz 14 TL 2 Tr 5 Ts /F1 12 Tf /Missing 18 Tf ET",
    ),
  });
  assert(executed.ok);
  const { textState } = GraphicsStateStack.current(
    executed.value.context.graphicsStateStack,
  );
  assert(textState.fontName.some);

  const result = await PdfResources.getFont(
    resources,
    textState.fontName.value,
    resolveRef,
  );

  expect(result).toEqual(ok(none));
  expect(textState).toMatchObject({
    fontName: { some: true, value: "Missing" },
    fontSize: 18,
    charSpace: 2,
    wordSpace: 3,
    horizontalScaling: 80,
    leading: 14,
    renderingMode: 2,
    rise: 5,
  });
});
