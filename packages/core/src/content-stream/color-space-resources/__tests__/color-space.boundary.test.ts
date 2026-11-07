import { assert, expect, test } from "vitest";
import { ColorSpace, GraphicsStateStack } from "../../graphics-state/index";
import { executeColorSpace } from "./setup-color-space";

test("不在の名前は警告して、以前の成分数を使わない", async () => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: "/DeviceRGB cs /Missing cs .1 .2 sc",
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_NOT_FOUND" },
  ]);
  expect(
    ColorSpace.componentCount(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .fillColorSpace,
    ),
  ).toEqual({ some: false });
});

test.each([
  "cs",
  "CS",
])("%s は名前オペランド以外を拒否する", async (operatorName) => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: `1 ${operatorName}`,
  });

  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      expected: "name",
      actual: "integer",
    },
  });
});

test("ICCBased の欠落した /N は成分数不明になる", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /ICC [/ICCBased 1 0 R] >> >>",
    objects: ["<< /Length 0 >>\nstream\n\nendstream"],
    content: "/ICC cs .1 .2 sc",
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_INVALID" },
  ]);
});

test("選択されていない色空間の解決エラーは実行を妨げない", async () => {
  const source = {
    resources: "<< /ColorSpace << /Broken 1 0 R >> >>",
    objects: ["<< /Broken"],
  };
  const unused = await executeColorSpace({
    ...source,
    content: "/DeviceRGB cs 1 0 0 sc",
  });
  const selected = await executeColorSpace({
    ...source,
    content: "/Broken cs",
  });

  expect(unused).toMatchObject({ ok: true });
  expect(selected).toMatchObject({
    ok: false,
    error: { code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
  });
});

test("Pattern の色指定に sc は使用できない", async () => {
  const result = await executeColorSpace({
    resources: "<< >>",
    content: "/Pattern cs sc",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OPERATOR_ILLEGAL_STATE", operatorName: "sc" },
  });
});

test("非着色Patternの基底の成分数も検証する", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /Pat [/Pattern /DeviceRGB] >> >>",
    content: "/Pat cs .1 .2 /P1 scn",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OPERATOR_OPERAND_COUNT_MISMATCH", required: 3, actual: 2 },
  });
});

test.each([
  "[]",
  "[1]",
  "[null]",
])("族名のない配列 %s は不正な定義として警告する", async (definition) => {
  const result = await executeColorSpace({
    resources: `<< /ColorSpace << /Bad ${definition} >> >>`,
    content: "/Bad cs .1 .2 sc",
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "COLOR_SPACE_INVALID" },
  ]);
});

test("CIEのパラメータ辞書の参照解決エラーは選択時に返す", async () => {
  const result = await executeColorSpace({
    resources: "<< /ColorSpace << /Cal [/CalRGB 1 0 R] >> >>",
    objects: ["<< /Broken"],
    content: "/Cal cs",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
  });
});
