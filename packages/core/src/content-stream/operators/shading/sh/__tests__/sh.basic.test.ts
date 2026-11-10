import { assert, expect, test } from "vitest";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperandStack } from "../../../../operand-stack/index";
import { setupPaint } from "../../../../paint-resources/__tests__/setup-paint";

test("shはShadingの名前を解決し色と色空間を変更しない", async () => {
  const { execute } = await setupPaint({
    resources:
      "<< /Shading << /S1 << /ShadingType 2 /ColorSpace /DeviceRGB /Function 99 0 R >> >> >>",
  });
  const result = execute(".25 g /S1 sh");
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .fillColor,
  ).toEqual({ kind: "gray", g: 0.25 });
  expect(result.value.warnings).toEqual([]);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
});

test("既定レジストリにもshが登録され不在の名前は位置付き警告になる", () => {
  const result = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode("/Missing sh"),
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "SHADING_NOT_FOUND", offset: 9 },
  ]);
});

test.each([
  0, 8, 99,
])("未知のShadingType %s はshの位置で警告し処理を継続する", async (type) => {
  const { execute } = await setupPaint({
    resources: `<< /Shading << /S1 << /ShadingType ${type} /ColorSpace /DeviceRGB >> >> >>`,
  });
  const result = execute("/S1 sh .75 g");
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "SHADING_UNSUPPORTED", offset: 4 },
  ]);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .fillColor,
  ).toEqual({ kind: "gray", g: 0.75 });
});

test.each([
  "sh",
  "/S1 /S2 sh",
])("shの名前の過不足を拒否する: %s", async (content) => {
  const { execute } = await setupPaint({ resources: "<< >>" });
  const result = execute(content);
  assert(!result.ok);

  expect(result.error).toMatchObject({
    code: "OPERATOR_OPERAND_COUNT_MISMATCH",
    operatorName: "sh",
    required: 1,
  });
});

test("shは数値オペランドを拒否する", async () => {
  const { execute } = await setupPaint({ resources: "<< >>" });
  const result = execute("1 sh");
  assert(!result.ok);

  expect(result.error).toMatchObject({
    code: "OPERATOR_OPERAND_TYPE_MISMATCH",
    operatorName: "sh",
  });
});
