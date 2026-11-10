import { assert, expect, test } from "vitest";
import {
  setupPaint,
  tilingPattern,
} from "../../../../content-stream/paint-resources/__tests__/setup-paint";

test("タイリングパターンはセルの種別・境界・間隔・リソースと未復号ストリームを保持する", async () => {
  const { paints } = await setupPaint({
    resources: "<< /Pattern << /P1 1 0 R >> >>",
    objects: [tilingPattern()],
  });
  const result = paints.patterns.get("P1");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    patternType: 1,
    paintType: 1,
    tilingType: 1,
    bbox: [0, 0, 8, 8],
    xStep: 8,
    yStep: 8,
    matrix: [1, 0, 0, 1, 0, 0],
    resources: { type: "dictionary" },
    stream: { type: "stream", data: new Uint8Array() },
  });
});

test("タイリングの属性と座標要素が間接参照でも解決できる", async () => {
  const { paints } = await setupPaint({
    resources: "<< /Pattern 1 0 R >>",
    objects: [
      "<< /Tile 2 0 R >>",
      tilingPattern(
        "/PatternType 3 0 R /PaintType 4 0 R /TilingType 5 0 R /BBox 6 0 R /XStep 7 0 R /YStep 8 0 R /Resources 9 0 R /Matrix 10 0 R",
      ),
      "1",
      "2",
      "3",
      "[0 0 11 0 R 12 0 R]",
      "-12",
      "10",
      "<< /Font <<>> >>",
      "[1 0 0 1 13 0 R 14 0 R]",
      "12",
      "10",
      "3",
      "4",
    ],
  });
  const result = paints.patterns.get("Tile");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    patternType: 1,
    paintType: 2,
    tilingType: 3,
    bbox: [0, 0, 12, 10],
    xStep: -12,
    yStep: 10,
    matrix: [1, 0, 0, 1, 3, 4],
  });
});

test("シェーディングパターンは間接参照のShadingとExtGStateを保持する", async () => {
  const { paints } = await setupPaint({
    resources: "<< /Pattern << /P2 1 0 R >> >>",
    objects: [
      "<< /PatternType 2 /Shading 2 0 R /ExtGState 3 0 R /Matrix [2 0 0 2 5 6] >>",
      "<< /ShadingType 2 /ColorSpace /DeviceRGB /Function 99 0 R >>",
      "<< /ca .4 >>",
    ],
  });
  const result = paints.patterns.get("P2");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    patternType: 2,
    shading: {
      shadingType: 2,
      function: {
        some: true,
        value: { type: "indirect-ref", objectNumber: 99, generationNumber: 0 },
      },
    },
    extGState: { some: true, value: { type: "dictionary" } },
    matrix: [2, 0, 0, 2, 5, 6],
  });
});
