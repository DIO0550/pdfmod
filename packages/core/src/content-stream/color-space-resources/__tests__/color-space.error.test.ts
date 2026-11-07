import { assert, expect, test } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import { ColorSpace, GraphicsStateStack } from "../../graphics-state/index";
import { ColorSpaceResources } from "../index";
import { executeColorSpace } from "./setup-color-space";

test.each([
  ["sc", "cs"],
  ["SC", "CS"],
  ["scn", "cs"],
  ["SCN", "CS"],
])("%s は現在の色空間と成分数の過不足を検出する", async (operatorName, selection) => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: `/DeviceRGB ${selection} .1 .2 ${operatorName}`,
  });

  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "OPERATOR_OPERAND_COUNT_MISMATCH",
      operatorName,
      required: 3,
      actual: 2,
    },
  });
});

test.each([
  ".1 .2 .3 .4",
  "",
])("sc はRGBの成分の過剰・欠落を検出する: %s", async (operands) => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: `/DeviceRGB cs ${operands} sc`,
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OPERATOR_OPERAND_COUNT_MISMATCH", required: 3 },
  });
});

test("成分数が一致しても数値以外の成分を拒否する", async () => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: "/DeviceRGB cs .1 /Bad .3 sc",
  });

  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      operatorName: "sc",
      expected: "number",
      actual: "name",
    },
  });
});

test.each([
  "/Mystery",
  "[/Mystery 1 2]",
])("未知の族 %s は選択位置に警告し、成分数を不明にする", async (definition) => {
  const result = await executeColorSpace({
    resources: `<< /ColorSpace << /Odd ${definition} >> >>`,
    content: "/DeviceCMYK cs /Odd cs .2 .4 sc",
  });
  assert(result.ok);

  expect(
    ColorSpace.componentCount(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .fillColorSpace,
    ),
  ).toEqual({ some: false });
  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_UNSUPPORTED", offset: 20 },
  ]);
});

test.each([
  "0",
  "2",
  "-1",
  "1.5",
  "/Bad",
  "null",
])("ICCBased の不正な /N %s は警告し成分数を決めない", async (n) => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /ICC [/ICCBased 1 0 R] >> >>",
    objects: [`<< /N ${n} /Length 0 >>\nstream\n\nendstream`],
    content: "/ICC cs .1 .2 sc",
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_INVALID" },
  ]);
  expect(
    ColorSpace.componentCount(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .fillColorSpace,
    ),
  ).toEqual({ some: false });
});

test("基底色空間の循環は警告にして無限再帰を避ける", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /Cycle 1 0 R >> >>",
    objects: ["[/Pattern 1 0 R]"],
    content: "/Cycle cs",
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_INVALID" },
  ]);
});

test("カテゴリの解決エラーは準備時に原因を保持して返す", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /ColorSpace 1 0 R >>",
    objects: ["<< /Broken"],
  });
  const result = await ColorSpaceResources.fromResources(resources, resolveRef);

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
  });
});
