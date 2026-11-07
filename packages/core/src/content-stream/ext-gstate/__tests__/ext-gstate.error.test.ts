import { assert, expect, test } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import { GraphicsStateStack } from "../../graphics-state/index";
import { ExtGStateResources } from "../index";
import { executeExtGState } from "./setup-ext-gstate";

test("未知・未対応のキーは警告し、前後の対応キーは適用する", async () => {
  const result = await executeExtGState({
    resources:
      "<< /ExtGState << /GS << /LW 3 /Unknown 99 0 R /OP true /ca .4 /Type /ExtGState >> >> >>",
    content: "/GS gs 7 w",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.fillAlpha).toBe(0.4);
  expect(state.lineWidth).toBe(7);
  expect(result.value.warnings).toEqual([
    {
      code: "EXT_GSTATE_UNSUPPORTED_ENTRY",
      message: "Unsupported ExtGState entry: /Unknown",
      offset: 4,
    },
    {
      code: "EXT_GSTATE_UNSUPPORTED_ENTRY",
      message: "Unsupported ExtGState entry: /OP",
      offset: 4,
    },
  ]);
});

test.each([
  "/LW /Wide",
  "/LC 3",
  "/LC 1.0",
  "/ML true",
  "/D [[2 /Bad] 1]",
  "/D [2 1]",
  "/D [[2] /Bad]",
  "/D [[]]",
  "/CA 1.1",
  "/ca -.1",
  "/BM 7",
  "/BM [/Normal 2]",
  "/BM /Unknown",
  "/SMask /Unknown",
  "/Font [/F1 12]",
  "/Font [<<>> /Bad]",
  "/Font [<<>> 12 3]",
])("不正な %s だけを無視し、他のパラメータを適用する", async (entry) => {
  const result = await executeExtGState({
    resources: `<< /ExtGState << /GS << ${entry} /LJ 2 >> >> >>`,
    content: "5 w /GS gs",
  });
  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );

  expect(state.lineJoin).toBe(2);
  expect(result.value.warnings).toMatchObject([
    {
      code: "EXT_GSTATE_INVALID_ENTRY",
      message: expect.stringContaining(entry.split(" ")[0]),
    },
  ]);
});

test.each([
  "<< >>",
  "<< /ExtGState << /Other << /LW 8 >> >> >>",
  "<< /ExtGState << /GS 12 >> >>",
  "<< /ExtGState 12 >>",
])("名前が解決できなければ警告して現在の状態を保持する: %s", async (resources) => {
  const result = await executeExtGState({ resources, content: "5 w /GS gs" });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .lineWidth,
  ).toBe(5);
  expect(result.value.warnings).toMatchObject([
    { code: "EXT_GSTATE_NOT_FOUND", message: "ExtGState not found: /GS" },
  ]);
});

test("使わない名前の壊れた参照は他の名前の実行を妨げない", async () => {
  const result = await executeExtGState({
    resources: "<< /ExtGState << /Broken 1 0 R /GS << /LW 8 >> >> >>",
    objects: ["]"],
    content: "/GS gs",
  });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .lineWidth,
  ).toBe(8);
  expect(result.value.warnings).toEqual([]);
});

test("選択した名前の参照解決エラーは未解決警告へ変換しない", async () => {
  const result = await executeExtGState({
    resources: "<< /ExtGState << /GS 1 0 R >> >>",
    objects: ["]"],
    content: "/GS gs",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
  });
});

test("カテゴリの参照解決エラーは準備段階で返す", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /ExtGState 1 0 R >>",
    objects: ["]"],
  });

  const result = await ExtGStateResources.fromResources(resources, resolveRef);

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OBJECT_PARSE_UNEXPECTED_TOKEN" },
  });
});
