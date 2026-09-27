import { expectTypeOf, test } from "vitest";
import { ok } from "../../../utils/result/index";
import { type OperatorHandler, OperatorRegistry } from "../index";

test("OperatorRegistry は Brand を持たず readonly な handlers だけを持つ", () => {
  expectTypeOf<OperatorRegistry>().toEqualTypeOf<{
    readonly handlers: ReadonlyMap<string, OperatorHandler>;
  }>();
});

test("OperatorRegistry の handlers に直接登録できない", () => {
  const registry = OperatorRegistry.create();
  const handler: OperatorHandler = (context) => ok(context);
  // @ts-expect-error handlers は ReadonlyMap
  registry.handlers.set("X", handler);
});
