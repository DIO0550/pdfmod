import { assert, expect, test } from "vitest";
import { setupPaint } from "../../../../content-stream/paint-resources/__tests__/setup-paint";

test.each([
  "/ColorSpace 42",
  "/Background [.1 /Bad .3]",
  "/BBox [0 0 10]",
  "/BBox [0 0 10 /Bad]",
])("シェーディングの不正な共通属性は警告になる: %s", async (entries) => {
  const { execute } = await setupPaint({
    resources: `<< /Shading << /S1 << /ShadingType 2 /ColorSpace /DeviceRGB ${entries} >> >> >>`,
  });
  const result = execute("/S1 sh");
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "SHADING_INVALID", offset: 4 },
  ]);
});

test.each([
  4, 5, 6, 7,
])("メッシュ種別%sがストリームでない場合は警告する", async (shadingType) => {
  const { execute } = await setupPaint({
    resources: `<< /Shading << /S1 << /ShadingType ${shadingType} /ColorSpace /DeviceRGB >> >> >>`,
  });
  const result = execute("/S1 sh");
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([{ code: "SHADING_INVALID" }]);
});
