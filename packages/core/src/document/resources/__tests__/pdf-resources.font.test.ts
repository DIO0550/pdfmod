import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../../content-stream/graphics-state/index";
import { ContentStreamInterpreter } from "../../../content-stream/interpreter/index";
import { none } from "../../../utils/option/index";
import { ok } from "../../../utils/result/index";
import { PdfResources } from "../index";

import { setupResources } from "./setup-resources";

const FontBody = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

test.each([
  { resources: `<< /Font << /F1 ${FontBody} >> >>` },
  { resources: `<< /Font 1 0 R >>`, objects: [`<< /F1 ${FontBody} >>`] },
  { resources: "<< /Font << /F1 1 0 R >> >>", objects: [FontBody] },
  { resources: "<< /Font 1 0 R >>", objects: ["<< /F1 2 0 R >>", FontBody] },
])("/Font とフォント辞書の直値・間接参照を解決できる: $resources", async (source) => {
  const { resources, resolveRef } = setupResources(source);

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
  const { resources, resolveRef } = setupResources(source);

  const result = await PdfResources.getFont(resources, "F1", resolveRef);

  expect(result).toEqual(ok(none));
});

test.each([
  "<< /Font 1 0 R >>",
  "<< /Font << /F1 1 0 R >> >>",
])("参照先の構文不正は未解決として握りつぶさない: %s", async (source) => {
  const { resources, resolveRef } = setupResources({
    resources: source,
    objects: ["<< /Broken >>"],
  });

  const result = await PdfResources.getFont(resources, "F1", resolveRef);

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("Tf が保持した名前からフォント辞書へ到達できる", async () => {
  const { resources, resolveRef } = setupResources({
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
  const { resources, resolveRef } = setupResources({
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
