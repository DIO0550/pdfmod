import { assert, expect, test } from "vitest";
import { setupResources } from "../../__tests__/setup-resources";
import { ResourceParameters } from "../index";

test.each([
  4, 6,
] as const)("リソースの数値配列を%s個の座標へ絞り込む", async (size) => {
  const values = Array.from({ length: size }, (_, i) => i + 1);
  const { resources, resolveRef } = setupResources({
    resources: `<< /Value [${values.join(" ")}] >>`,
  });
  const fields = await ResourceParameters.resolve(
    resources.dictionary,
    ["Value"],
    resolveRef,
  );
  assert(fields.ok);

  expect(
    await ResourceParameters.coordinates(
      fields.value.get("Value"),
      size,
      resolveRef,
    ),
  ).toEqual({ ok: true, value: { some: true, value: values } });
});

test("数値でない配列要素は座標として受理しない", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /Value [0 0 /Bad 4] >>",
  });
  const fields = await ResourceParameters.resolve(
    resources.dictionary,
    ["Value"],
    resolveRef,
  );
  assert(fields.ok);

  expect(
    await ResourceParameters.coordinates(
      fields.value.get("Value"),
      4,
      resolveRef,
    ),
  ).toEqual({ ok: true, value: { some: false } });
});

test("不正な属性参照をPDFのnullとして保持し、属性の省略と区別する", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /Matrix 0 0 R >>",
  });
  const result = await ResourceParameters.resolve(
    resources.dictionary,
    ["Matrix", "BBox"],
    resolveRef,
  );
  assert(result.ok);

  expect([...result.value]).toEqual([["Matrix", { type: "null" }]]);
});
