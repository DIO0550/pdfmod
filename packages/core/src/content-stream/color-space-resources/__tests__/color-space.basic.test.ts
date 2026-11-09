import { assert, expect, test } from "vitest";
import { ColorSpace, GraphicsStateStack } from "../../graphics-state/index";
import { executeColorSpace } from "./setup-color-space";

test.each([
  ["/DeviceGray", 1],
  ["/DeviceRGB", 3],
  ["/DeviceCMYK", 4],
  ["[/CalGray << /WhitePoint [1 1 1] >>]", 1],
  ["[/CalRGB << /WhitePoint [1 1 1] >>]", 3],
  ["[/Lab << /WhitePoint [1 1 1] >>]", 3],
  ["[/Indexed /DeviceRGB 1 <000000FFFFFF>]", 1],
  ["[/Separation /Spot /DeviceCMYK << /FunctionType 2 >>]", 1],
  ["[/DeviceN [/Cyan /Magenta] /DeviceCMYK << /FunctionType 2 >>]", 2],
] as const)("%s の数値成分数は %i", async (definition, count) => {
  const values = Array.from({ length: count }, (_, i) => (i + 1) / 10).join(
    " ",
  );
  const result = await executeColorSpace({
    resources: `<< /ColorSpace << /CS1 ${definition} >> >>`,
    content: `/CS1 cs ${values} sc`,
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(ColorSpace.componentCount(state.fillColorSpace)).toEqual({
    some: true,
    value: count,
  });
  expect(result.value.warnings).toEqual([]);
});

test.each([
  1, 3, 4,
])("ICCBased はプロファイルの間接参照 /N=%i を使う", async (count) => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace 1 0 R >>",
    objects: [
      "<< /ICC 2 0 R >>",
      "[/ICCBased 3 0 R]",
      "<< /N 4 0 R /Length 0 >>\nstream\n\nendstream",
      String(count),
    ],
    content: `/ICC cs ${Array.from({ length: count }, () => ".5").join(" ")} scn`,
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(ColorSpace.componentCount(state.fillColorSpace)).toEqual({
    some: true,
    value: count,
  });
  expect(result.value.warnings).toEqual([]);
});

test("Indexed の基底の配列・族名・パラメータを間接参照で解決する", async () => {
  const result = await executeColorSpace({
    resources:
      "<< /ColorSpace << /Palette [/Indexed 1 0 R 1 <000000FFFFFF>] >> >>",
    objects: ["[2 0 R 3 0 R]", "/CalRGB", "<< /WhitePoint [1 1 1] >>"],
    content: "/Palette cs 1 sc",
  });
  assert(result.ok);
  const space = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  ).fillColorSpace;

  expect(space).toMatchObject({
    family: "Indexed",
    base: { family: "CalRGB" },
  });
  expect(ColorSpace.componentCount(space)).toEqual({ some: true, value: 1 });
  expect(result.value.warnings).toEqual([]);
});

test("DeviceN の間接参照の名前配列と各名前を解決する", async () => {
  const result = await executeColorSpace({
    resources:
      "<< /ColorSpace << /Ink [/DeviceN 1 0 R /DeviceRGB << /FunctionType 2 >>] >> >>",
    objects: ["[/Cyan 2 0 R /Yellow]", "/Magenta"],
    content: "/Ink cs .1 .2 .3 scn",
  });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .fillColorSpace,
  ).toMatchObject({ family: "DeviceN", names: ["Cyan", "Magenta", "Yellow"] });
});
