import { assert, expect, test } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import { GraphicsStateStack } from "../../graphics-state/index";
import { ContentStreamInterpreter } from "../../interpreter/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { ExtGStateResources } from "../index";
import { executeExtGState } from "./setup-ext-gstate";

test("間接参照の拡張状態を適用し、専用オペレータで上書きできる", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /ExtGState 1 0 R >>",
    objects: [
      "<< /GS1 2 0 R >>",
      "<< /LW 3 /LC 1 /LJ 2 /ML 8 /D [[2 3] 1] /CA .4 /ca .6 /BM /Multiply >>",
    ],
  });
  const prepared = await ExtGStateResources.fromResources(
    resources,
    resolveRef,
  );
  assert(prepared.ok);
  const registry = OperatorRegistry.createDefault(prepared.value);
  assert(registry.ok);

  const result = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode("/GS1 gs 7 w"),
    registry: registry.value,
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state).toMatchObject({
    lineWidth: 7,
    lineCap: 1,
    lineJoin: 2,
    miterLimit: 8,
    dashPattern: { array: [2, 3], phase: 1 },
    strokeAlpha: 0.4,
    fillAlpha: 0.6,
    blendMode: "Multiply",
  });
  expect(result.value.warnings).toEqual([]);
});

test.each([
  ["/LW 3", "lineWidth", 3],
  ["/LC 1", "lineCap", 1],
  ["/LJ 2", "lineJoin", 2],
  ["/ML 4", "miterLimit", 4],
  ["/D [[2 4] 1]", "dashPattern", { array: [2, 4], phase: 1 }],
  ["/CA 0", "strokeAlpha", 0],
  ["/ca .75", "fillAlpha", 0.75],
  ["/BM /Screen", "blendMode", "Screen"],
] as const)("%s は既存状態の該当パラメータを変更する", async (entry, field, expected) => {
  const result = await executeExtGState({
    resources: `<< /ExtGState << /GS << ${entry} >> >> >>`,
    content: "/GS gs",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state[field]).toEqual(expected);
  expect(result.value.warnings).toEqual([]);
});

test("省略したパラメータは直前の状態を保持する", async () => {
  const result = await executeExtGState({
    resources: "<< /ExtGState << /GS << /ca .3 >> >> >>",
    content: "9 w 2 J /GS gs",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.lineWidth).toBe(9);
  expect(state.lineCap).toBe(2);
});

test("入れ子の q と Q で透明度・フォント・線の状態を段階的に復元する", async () => {
  const source = {
    resources:
      "<< /ExtGState << /Outer << /LW 3 /LC 1 /LJ 2 /ML 8 /D [[2 3] 1] /CA .4 /ca .2 /BM /Multiply /SMask << /S /Luminosity >> /Font [1 0 R 14] >> /Inner << /LW 6 /LC 2 /LJ 1 /ML 12 /D [[4 5] 2] /CA .8 /ca .6 /BM /Screen /SMask /None /Font [2 0 R 20] >> >> >>",
    objects: [
      "<< /Type /Font /BaseFont /Helvetica >>",
      "<< /Type /Font /BaseFont /Courier >>",
    ],
  };
  const outer = await executeExtGState({ ...source, content: "/Outer gs" });
  const restored = await executeExtGState({
    ...source,
    content: "/Outer gs q /Inner gs q 9 w Q Q",
  });
  assert(outer.ok);
  assert(restored.ok);

  expect(
    GraphicsStateStack.current(restored.value.context.graphicsStateStack),
  ).toEqual(GraphicsStateStack.current(outer.value.context.graphicsStateStack));
});

test("ExtGState の Font はローカル名でなくフォント辞書とサイズを保持する", async () => {
  const result = await executeExtGState({
    resources: "<< /ExtGState << /GS << /Font [1 0 R 14] >> >> >>",
    objects: ["<< /Type /Font /BaseFont /Helvetica >>"],
    content: "/F1 12 Tf /GS gs 2 Tc 3 Tw 90 Tz 18 TL 2 Tr 4 Ts",
  });
  assert(result.ok);
  const text = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  ).textState;

  expect(text.font).toMatchObject({
    some: true,
    value: {
      type: "dictionary",
      dictionary: {
        entries: new Map([
          ["Type", { type: "name", value: "Font" }],
          ["BaseFont", { type: "name", value: "Helvetica" }],
        ]),
      },
    },
  });
  expect(text.fontName).toEqual({ some: false });
  expect(text).toMatchObject({
    fontSize: 14,
    charSpace: 2,
    wordSpace: 3,
    horizontalScaling: 90,
    leading: 18,
    renderingMode: 2,
    rise: 4,
  });
});

test("gs の後の Tf は辞書指定を名前指定へ置き換える", async () => {
  const result = await executeExtGState({
    resources: "<< /ExtGState << /GS << /Font [1 0 R 14] >> >> >>",
    objects: ["<< /Type /Font >>"],
    content: "/GS gs /F2 9 Tf",
  });
  assert(result.ok);
  const text = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  ).textState;

  expect(text.font).toEqual({
    some: true,
    value: { type: "name", name: "F2" },
  });
  expect(text.fontName).toEqual({ some: true, value: "F2" });
  expect(text.fontSize).toBe(9);
});
