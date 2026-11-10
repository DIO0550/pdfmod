import { assert, expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  GraphicsStateStack,
} from "../../graphics-state/index";
import { executeColorSpace } from "./setup-color-space";

test.each([
  {
    label: "直接の別名",
    resources: "<< /ColorSpace << /Alias /Missing >> >>",
    objects: [],
  },
  {
    label: "間接参照の別名",
    resources: "<< /ColorSpace << /Alias 1 0 R >> >>",
    objects: ["/Missing"],
  },
  {
    label: "連鎖する別名",
    resources: "<< /ColorSpace << /Alias /Next /Next /Missing >> >>",
    objects: [],
  },
])("$label の参照先がない場合は名前不在を警告する", async ({
  resources,
  objects,
}) => {
  const result = await executeColorSpace({
    resources,
    objects,
    content: "/Alias cs .2 .4 sc",
  });
  assert(result.ok);
  const space = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  ).fillColorSpace;

  expect(result.value.warnings).toEqual([
    {
      code: "COLOR_SPACE_NOT_FOUND",
      message: "Unresolved color space: /Missing",
      offset: 7,
    },
  ]);
  expect(space).toEqual({ family: "Unknown", name: "Missing" });
  expect(ColorSpace.componentCount(space)).toEqual({ some: false });
});

test("輪郭色空間の別名の参照先がない場合も名前不在を警告する", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /Alias /Missing >> >>",
    content: "/Alias CS .2 .4 SC",
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_NOT_FOUND", offset: 7 },
  ]);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .strokeColorSpace,
  ).toEqual({ family: "Unknown", name: "Missing" });
});

test("別名の参照先が存在すれば警告なく色空間を選択できる", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /Alias /Target /Target /DeviceRGB >> >>",
    content: "/Alias cs .2 .4 .6 sc",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.fillColorSpace).toEqual(ColorSpace.deviceRGB());
  expect(state.fillColor).toEqual(Color.rgb(0.2, 0.4, 0.6));
  expect(result.value.warnings).toEqual([]);
});

test("Indexedの基底名が見つからなくても添字の成分数は1のままになる", async () => {
  const result = await executeColorSpace({
    resources:
      "<< /ColorSpace << /Palette [/Indexed /Missing 1 <000000FFFFFF>] >> >>",
    content: "/Palette cs 1 sc",
  });
  assert(result.ok);
  const space = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  ).fillColorSpace;

  expect(result.value.warnings).toMatchObject([
    {
      code: "COLOR_SPACE_NOT_FOUND",
      message: "Unresolved color space: /Missing",
      offset: 9,
    },
  ]);
  expect(ColorSpace.componentCount(space)).toEqual({ some: true, value: 1 });
});
