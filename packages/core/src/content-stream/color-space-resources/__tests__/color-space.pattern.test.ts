import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../graphics-state/index";
import { tilingPattern } from "../../paint-resources/__tests__/setup-paint";
import { executeColorSpace } from "./setup-color-space";

test.each([
  {
    definition: "/Pattern",
    operands: "/P1",
    components: [],
    selection: "cs",
    operatorName: "scn",
    target: "fillColor",
  },
  {
    definition: "/Pattern",
    operands: "/P1",
    components: [],
    selection: "CS",
    operatorName: "SCN",
    target: "strokeColor",
  },
  {
    definition: "[/Pattern /DeviceRGB]",
    operands: ".1 .2 .3 /P1",
    components: [0.1, 0.2, 0.3],
    selection: "cs",
    operatorName: "scn",
    target: "fillColor",
  },
  {
    definition: "[/Pattern /DeviceRGB]",
    operands: ".1 .2 .3 /P1",
    components: [0.1, 0.2, 0.3],
    selection: "CS",
    operatorName: "SCN",
    target: "strokeColor",
  },
] as const)("$definition の$operatorNameはパターン名を数値成分に数えない", async ({
  definition,
  operands,
  components,
  selection,
  operatorName,
  target,
}) => {
  const result = await executeColorSpace({
    resources: `<< /ColorSpace << /Pat ${definition} >> /Pattern << /P1 1 0 R >> >>`,
    objects: [tilingPattern(components.length > 0 ? "/PaintType 2" : "")],
    content: `/Pat ${selection} ${operands} ${operatorName}`,
  });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)[target],
  ).toMatchObject({
    kind: "components",
    components,
    pattern: { some: true, value: "P1" },
  });
  expect(result.value.warnings).toEqual([]);
});
