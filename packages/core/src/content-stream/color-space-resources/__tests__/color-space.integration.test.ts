import { assert, expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  GraphicsStateStack,
} from "../../graphics-state/index";
import { executeColorSpace } from "./setup-color-space";

test("リソースのRGB色空間を選択して塗りの色を変更する", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /CS1 /DeviceRGB >> >>",
    content: "/CS1 cs .2 .4 .6 sc",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.fillColorSpace).toEqual(ColorSpace.deviceRGB());
  expect(state.fillColor).toEqual(Color.rgb(0.2, 0.4, 0.6));
  expect(result.value.warnings).toEqual([]);
});

test("CS と SCN は輪郭だけを変更し、q/Q は色空間と色を復元する", async () => {
  const result = await executeColorSpace({
    resources:
      "<< /ColorSpace << /Ink [/DeviceN [/Cyan /Magenta] /DeviceCMYK << /FunctionType 2 >>] >> >>",
    content: ".6 g /Ink CS .2 .8 SCN q /DeviceRGB CS .1 .2 .3 SC Q",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.strokeColorSpace).toMatchObject({ family: "DeviceN" });
  expect(state.strokeColor).toMatchObject({
    kind: "components",
    components: [0.2, 0.8],
  });
  expect(state.fillColor).toEqual(Color.gray(0.6));
  expect(result.value.warnings).toEqual([]);
});

test("色空間の選択は前の色を新しい色空間の初期色へ切り替える", async () => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: "1 0 0 rg /DeviceCMYK cs",
  });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .fillColor,
  ).toEqual(Color.cmyk(0, 0, 0, 1));
});

test("同名の色空間は現在のリソーススコープで解決する", async () => {
  const source = { content: "/CS1 cs .1 .2 .3 sc" };
  const rgb = await executeColorSpace({
    ...source,
    resources: "<< /ColorSpace << /CS1 /DeviceRGB >> >>",
  });
  const gray = await executeColorSpace({
    ...source,
    resources: "<< /ColorSpace << /CS1 /DeviceGray >> >>",
  });

  expect(rgb).toMatchObject({ ok: true });
  expect(gray).toMatchObject({
    ok: false,
    error: { code: "OPERATOR_OPERAND_COUNT_MISMATCH", required: 1, actual: 3 },
  });
});
