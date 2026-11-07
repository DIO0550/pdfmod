import { assert, expect, test } from "vitest";
import { setupResources } from "../../../../../document/resources/__tests__/setup-resources";
import { ExtGStateResources } from "../../../../ext-gstate/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperandStack } from "../../../../operand-stack/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerGraphicsStateOperators } from "../../graphics-state-operators/index";

test.each([
  ["gs", "OPERATOR_OPERAND_MISSING"],
  ["12 gs", "OPERATOR_OPERAND_TYPE_MISMATCH"],
])("%s は名前オペランドのエラーを返す", (content, code) => {
  const result = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode(content),
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code, operatorName: "gs" },
  });
});

test("スコープがない gs も登録済みで、未知オペレータ扱いにしない", () => {
  const result = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode("99 /GS gs"),
  });
  assert(result.ok);

  expect(result.value.warnings).toMatchObject([
    { code: "EXT_GSTATE_NOT_FOUND" },
  ]);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(1);
});

test("グラフィックスオペレータの一括登録にも gs のスコープを渡せる", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /ExtGState << /GS << /LW 7 >> >> >>",
  });
  const prepared = await ExtGStateResources.fromResources(
    resources,
    resolveRef,
  );
  assert(prepared.ok);
  const registry = registerGraphicsStateOperators(
    OperatorRegistry.create(),
    prepared.value,
  );
  assert(registry.ok);

  const result = ContentStreamInterpreter.execute({
    data: new TextEncoder().encode("/GS gs"),
    registry: registry.value,
  });
  assert(result.ok);

  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .lineWidth,
  ).toBe(7);
});
