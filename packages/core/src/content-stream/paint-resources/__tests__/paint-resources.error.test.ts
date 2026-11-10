import { assert, expect, test } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import { PaintResources } from "../index";
import { setupPaint, tilingPattern } from "./setup-paint";

test.each([
  "scn",
  "SCN",
])("Pattern以外の色空間では%sの名前オペランドを拒否する", async (operator) => {
  const { execute } = await setupPaint({ resources: "<< >>" });
  const selection = operator === "scn" ? "cs" : "CS";
  const result = execute(`/DeviceRGB ${selection} .1 .2 /P1 ${operator}`);
  assert(!result.ok);

  expect(result.error).toMatchObject({
    code: "OPERATOR_OPERAND_TYPE_MISMATCH",
    operatorName: operator,
  });
});

test.each([
  "Pattern",
  "Shading",
])("/%s カテゴリの参照エラーは準備時に伝播する", async (category) => {
  const { resources, resolveRef } = setupResources({
    resources: `<< /${category} 1 0 R >>`,
    objects: ["<< /Broken"],
  });
  const result = await PaintResources.fromResources(resources, resolveRef);
  assert(!result.ok);

  expect(result.error).toMatchObject({
    code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
  });
});

test.each([
  { category: "Pattern", content: "/Pattern cs /Bad scn" },
  { category: "Shading", content: "/Bad sh" },
])("/$category の個別参照エラーは使用する命令へ伝播する", async ({
  category,
  content,
}) => {
  const { execute } = await setupPaint({
    resources: `<< /${category} << /Bad 1 0 R >> >>`,
    objects: ["<< /Broken"],
  });
  const unused = execute(".5 g");
  assert(unused.ok);

  const used = execute(content);
  assert(!used.ok);

  expect(used.error).toMatchObject({
    code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
  });
});

test.each([
  { definition: "/Pattern", operands: "/P1", paint: 2 },
  { definition: "[/Pattern /DeviceRGB]", operands: ".1 .2 .3 /P1", paint: 1 },
])("着色方式とPattern基底色空間の不一致を拒否する: $definition", async ({
  definition,
  operands,
  paint,
}) => {
  const { execute } = await setupPaint({
    resources: `<< /ColorSpace << /Pat ${definition} >> /Pattern << /P1 1 0 R >> >>`,
    objects: [tilingPattern(`/PaintType ${paint}`)],
  });
  const result = execute(`/Pat cs ${operands} scn`);
  assert(!result.ok);

  expect(result.error).toMatchObject({
    code: "OPERATOR_ILLEGAL_STATE",
    operatorName: "scn",
  });
});

test.each([
  {
    resources: "<< /Pattern << /Bad 1 0 R >> >>",
    objects: [tilingPattern("/Matrix [1 0 0 1 2 0 R 0]"), "<< /Broken"],
    content: "/Pattern cs /Bad scn",
  },
  {
    resources:
      "<< /Shading << /Bad << /ShadingType 2 /ColorSpace /DeviceRGB /BBox [0 0 1 0 R 10] >> >> >>",
    objects: ["<< /Broken"],
    content: "/Bad sh",
  },
])("主要属性の配列要素の参照エラーを使用位置へ伝播する: $content", async ({
  resources,
  objects,
  content,
}) => {
  const { execute } = await setupPaint({ resources, objects });
  const result = execute(content);
  assert(!result.ok);

  expect(result.error).toMatchObject({ code: "OBJECT_PARSE_UNEXPECTED_TOKEN" });
});

test("参照先が存在せずnullへ解決された場合は不正なパターンとして警告する", async () => {
  const { execute } = await setupPaint({
    resources: "<< /Pattern << /P1 99 0 R >> >>",
  });
  const result = execute("/Pattern cs /P1 scn");
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([{ code: "PATTERN_INVALID" }]);
});
