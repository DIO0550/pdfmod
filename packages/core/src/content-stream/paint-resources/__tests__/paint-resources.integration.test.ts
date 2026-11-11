import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../graphics-state/index";
import { setupPaint, tilingPattern } from "./setup-paint";

test.each([
  { selection: "cs", operator: "scn", target: "fillColor" },
  { selection: "CS", operator: "SCN", target: "strokeColor" },
] as const)("$operator の名前から着色タイリングを取得できる", async ({
  selection,
  operator,
  target,
}) => {
  const { execute } = await setupPaint({
    resources: "<< /Pattern << /P1 1 0 R >> >>",
    objects: [tilingPattern()],
  });
  const result = execute(`/Pattern ${selection} /P1 ${operator}`);
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)[target],
  ).toMatchObject({ pattern: { some: true, value: "P1" }, components: [] });
  expect(result.value.warnings).toEqual([]);
});

test("非着色タイリングは基底色の数値成分とパターン名を受け取る", async () => {
  const { execute } = await setupPaint({
    resources:
      "<< /ColorSpace << /Pat [/Pattern /DeviceRGB] >> /Pattern << /P1 1 0 R >> >>",
    objects: [tilingPattern("/PaintType 2")],
  });
  const result = execute("/Pat cs .1 .2 .3 /P1 scn");
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .fillColor,
  ).toMatchObject({
    components: [0.1, 0.2, 0.3],
    pattern: { some: true, value: "P1" },
  });
  expect(result.value.warnings).toEqual([]);
});

test("シェーディングパターンをscnから取得しFunctionを評価しない", async () => {
  const { execute } = await setupPaint({
    resources:
      "<< /Pattern << /P2 << /PatternType 2 /Shading << /ShadingType 3 /ColorSpace /DeviceRGB /Function 99 0 R >> >> >> >>",
  });
  const result = execute("/Pattern cs /P2 scn");
  assert(result.ok);

  expect(result.value.warnings).toEqual([]);
});

test("パターンの選択はq/Qによって保存・復元される", async () => {
  const { execute } = await setupPaint({
    resources: "<< /Pattern << /P1 1 0 R /P2 2 0 R >> >>",
    objects: [tilingPattern(), tilingPattern("/XStep 16")],
  });
  const result = execute("/Pattern cs /P1 scn q /P2 scn Q");
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .fillColor,
  ).toMatchObject({ pattern: { some: true, value: "P1" } });
  expect(result.value.warnings).toEqual([]);
});

test("別のページの同名パターンへフォールバックしない", async () => {
  const defined = await setupPaint({
    resources: "<< /Pattern << /P1 1 0 R >> >>",
    objects: [tilingPattern()],
  });
  const empty = await setupPaint({ resources: "<< >>" });
  const first = defined.execute("/Pattern cs /P1 scn");
  const second = empty.execute("/Pattern cs /P1 scn");
  assert(first.ok && second.ok);

  expect(first.value.warnings).toEqual([]);
  expect(second.value.warnings).toMatchObject([
    {
      code: "PATTERN_NOT_FOUND",
      message: "Pattern resource not found: /P1",
      offset: 16,
    },
  ]);
});
