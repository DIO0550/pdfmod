import { assert, expect, test } from "vitest";
import {
  setupPaint,
  tilingPattern,
} from "../../../../content-stream/paint-resources/__tests__/setup-paint";

test.each([
  "/PaintType 3",
  "/TilingType 0",
  "/XStep 0",
  "/YStep 0",
  "/BBox [0 0 8]",
  "/Matrix [1 0]",
  "/Resources /Bad",
])("タイリングの不正な属性 %s は警告になる", async (entries) => {
  const { execute } = await setupPaint({
    resources: "<< /Pattern << /P1 1 0 R >> >>",
    objects: [tilingPattern(entries)],
  });
  const result = execute("/Pattern cs /P1 scn");
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "PATTERN_INVALID", offset: 16 },
  ]);
});

test.each([
  "<< /PatternType 42 >>",
  "<< >>",
])("未知・欠落のPatternTypeは未対応の定義として保持する: %s", async (definition) => {
  const { paints } = await setupPaint({
    resources: `<< /Pattern << /P1 ${definition} >> >>`,
  });
  const result = paints.patterns.get("P1");
  assert(result?.ok && result.value.some);

  expect(result.value.value).toMatchObject({
    patternType: "Unknown",
    warnings: [{ code: "PATTERN_UNSUPPORTED" }],
  });
});

test("シェーディングパターンのShading欠落は不正な定義として警告する", async () => {
  const { execute } = await setupPaint({
    resources: "<< /Pattern << /P2 << /PatternType 2 >> >> >>",
  });
  const result = execute("/Pattern cs /P2 scn");
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([{ code: "PATTERN_INVALID" }]);
});
