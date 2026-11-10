import { assert, expect, test } from "vitest";
import { setupPaint } from "../../../../content-stream/paint-resources/__tests__/setup-paint";

test.each([
  1, 2, 3, 4, 5, 6, 7,
])("ShadingType %s を判別しメッシュの未復号ストリームを保持する", async (shadingType) => {
  const dictionary = `<< /ShadingType ${shadingType} /ColorSpace /DeviceRGB /Function 99 0 R /Length 0 >>`;
  const object =
    shadingType < 4 ? dictionary : `${dictionary}\nstream\n\nendstream`;
  const { paints } = await setupPaint({
    resources: "<< /Shading << /S1 1 0 R >> >>",
    objects: [object],
  });
  const result = paints.shadings.get("S1");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    shadingType,
    colorSpace: { type: "name", value: "DeviceRGB" },
    function: { some: true, value: { type: "indirect-ref", objectNumber: 99 } },
  });
  if (shadingType >= 4) {
    expect(result.value.value).toMatchObject({
      stream: { data: new Uint8Array() },
    });
  }
});

test("シェーディングの色空間・背景色・境界と配列の各要素を間接参照から取得する", async () => {
  const { paints } = await setupPaint({
    resources: "<< /Shading 1 0 R >>",
    objects: [
      "<< /S1 2 0 R >>",
      "<< /ShadingType 3 0 R /ColorSpace 4 0 R /Background 5 0 R /BBox 6 0 R /Function [99 0 R] >>",
      "3",
      "/DeviceRGB",
      "[.1 7 0 R .3]",
      "[0 0 8 0 R 200]",
      ".2",
      "100",
    ],
  });
  const result = paints.shadings.get("S1");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    shadingType: 3,
    colorSpace: { type: "name", value: "DeviceRGB" },
    background: { some: true, value: [0.1, 0.2, 0.3] },
    bbox: { some: true, value: [0, 0, 100, 200] },
    function: {
      some: true,
      value: {
        type: "array",
        elements: [{ type: "indirect-ref", objectNumber: 99 }],
      },
    },
  });
});

test("背景色・境界・Functionの省略を不在として保持する", async () => {
  const { paints } = await setupPaint({
    resources:
      "<< /Shading << /S1 << /ShadingType 2 /ColorSpace [/CalRGB <<>>] >> >> >>",
  });
  const result = paints.shadings.get("S1");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    shadingType: 2,
    colorSpace: { type: "array" },
    background: { some: false },
    bbox: { some: false },
    function: { some: false },
  });
});
