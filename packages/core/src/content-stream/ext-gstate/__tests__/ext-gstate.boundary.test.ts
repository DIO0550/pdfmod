import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../graphics-state/index";
import { executeExtGState } from "./setup-ext-gstate";

test.each([
  ["[/Future /Multiply /Screen]", "Multiply"],
  ["[/Future]", "Normal"],
  ["[]", "Normal"],
  ["/Compatible", "Normal"],
  ["/Luminosity", "Luminosity"],
])("BM %s は最初の対応モード、または規定の Normal になる", async (value, expected) => {
  const result = await executeExtGState({
    resources: `<< /ExtGState << /Before << /BM /Overlay >> /GS << /BM ${value} >> >> >>`,
    content: "/Before gs /GS gs",
  });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .blendMode,
  ).toBe(expected);
});

test("SMask の辞書を保持し、None で解除する", async () => {
  const resources =
    "<< /ExtGState << /Mask << /SMask << /S /Alpha >> >> /Clear << /SMask /None >> >> >>";
  const masked = await executeExtGState({ resources, content: "/Mask gs" });
  const cleared = await executeExtGState({
    resources,
    content: "/Mask gs /Clear gs",
  });
  assert(masked.ok);
  assert(cleared.ok);

  expect(
    GraphicsStateStack.current(masked.value.context.graphicsStateStack)
      .softMask,
  ).toMatchObject({
    type: "dictionary",
    dictionary: { entries: new Map([["S", { type: "name", value: "Alpha" }]]) },
  });
  expect(
    GraphicsStateStack.current(cleared.value.context.graphicsStateStack)
      .softMask,
  ).toEqual({ type: "None" });
});

test("辞書値・配列・配列要素の間接参照を解決する", async () => {
  const result = await executeExtGState({
    resources:
      "<< /ExtGState << /GS << /LW 1 0 R /D 2 0 R /BM [6 0 R] /Font 7 0 R /SMask 9 0 R >> >> >>",
    objects: [
      "3",
      "[3 0 R 4 0 R]",
      "[5 0 R 2]",
      "1",
      "4",
      "/Screen",
      "[8 0 R 1 0 R]",
      "<< /Type /Font >>",
      "/None",
    ],
    content: "/GS gs",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state).toMatchObject({
    lineWidth: 3,
    dashPattern: { array: [4, 2], phase: 1 },
    blendMode: "Screen",
    textState: {
      fontSize: 3,
      font: { some: true, value: { type: "dictionary" } },
    },
    softMask: { type: "None" },
  });
  expect(result.value.warnings).toEqual([]);
});

test("無効な線接合は直前の状態を保持して警告する", async () => {
  const result = await executeExtGState({
    resources: "<< /ExtGState << /GS << /LJ -1 /LW 7 >> >> >>",
    content: "1 j /GS gs",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.lineJoin).toBe(1);
  expect(state.lineWidth).toBe(7);
  expect(result.value.warnings).toMatchObject([
    {
      code: "EXT_GSTATE_INVALID_ENTRY",
      message: "Invalid ExtGState entry: /LJ",
    },
  ]);
});

test("同名の拡張状態を別スコープから取得しない", async () => {
  const first = await executeExtGState({
    resources: "<< /ExtGState << /GS << /LW 3 >> >> >>",
    content: "/GS gs",
  });
  const second = await executeExtGState({
    resources: "<< /ExtGState << /GS << /LW 8 >> >> >>",
    content: "/GS gs",
  });
  assert(first.ok);
  assert(second.ok);

  expect(
    GraphicsStateStack.current(first.value.context.graphicsStateStack)
      .lineWidth,
  ).toBe(3);
  expect(
    GraphicsStateStack.current(second.value.context.graphicsStateStack)
      .lineWidth,
  ).toBe(8);
});
