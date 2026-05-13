import { expect, test } from "vitest";
import type { PdfError } from "../../../pdf/errors/index";
import { ok, unwrapOr } from "../../../utils/result/index";
import { type OperatorHandler, OperatorRegistry } from "../index";

const firstHandler: OperatorHandler = (context) => ok(context);
const secondHandler: OperatorHandler = (context) => ok(context);

test("createしたregistryは未登録operatorを持たない", () => {
  const registry = OperatorRegistry.create();

  expect(OperatorRegistry.has(registry, "m")).toBe(false);
  expect(OperatorRegistry.lookup(registry, "m")).toEqual({ some: false });
});

test("register後lookupはhandlerをsomeで返す", () => {
  const registry = OperatorRegistry.create();

  const result = OperatorRegistry.register(registry, "m", firstHandler);
  const updated = unwrapOr(result, registry);

  expect(result.ok).toBe(true);
  expect(updated).not.toBe(registry);
  expect(OperatorRegistry.lookup(updated, "m")).toEqual({
    some: true,
    value: firstHandler,
  });
});

test("registerは元registryを変更しない", () => {
  const registry = OperatorRegistry.create();

  OperatorRegistry.register(registry, "m", firstHandler);

  expect(OperatorRegistry.lookup(registry, "m")).toEqual({ some: false });
});

test("register後hasはtrueを返す", () => {
  const registry = OperatorRegistry.create();

  const result = OperatorRegistry.register(registry, "BT", firstHandler);
  const updated = unwrapOr(result, registry);

  expect(OperatorRegistry.has(updated, "BT")).toBe(true);
});

test("異なるoperator名は独立して登録できる", () => {
  const registry = OperatorRegistry.create();

  const firstResult = OperatorRegistry.register(registry, "m", firstHandler);
  const firstRegistry = unwrapOr(firstResult, registry);
  const secondResult = OperatorRegistry.register(
    firstRegistry,
    "l",
    secondHandler,
  );
  const secondRegistry = unwrapOr(secondResult, firstRegistry);

  expect(firstResult.ok).toBe(true);
  expect(secondResult.ok).toBe(true);
  expect(OperatorRegistry.lookup(secondRegistry, "m")).toEqual({
    some: true,
    value: firstHandler,
  });
  expect(OperatorRegistry.lookup(secondRegistry, "l")).toEqual({
    some: true,
    value: secondHandler,
  });
});

test("同名operatorの重複登録はエラーを返す", () => {
  const registry = OperatorRegistry.create();

  const firstResult = OperatorRegistry.register(registry, "rg", firstHandler);
  const firstRegistry = unwrapOr(firstResult, registry);
  const error = OperatorRegistry.register(firstRegistry, "rg", secondHandler);

  expect(error).toEqual({
    ok: false,
    error: {
      code: "OPERATOR_ALREADY_REGISTERED",
      message: "Operator is already registered: rg",
      operatorName: "rg",
    } satisfies PdfError,
  });
});

test("重複登録後も既存handlerを保持する", () => {
  const registry = OperatorRegistry.create();

  const firstResult = OperatorRegistry.register(registry, "rg", firstHandler);
  const firstRegistry = unwrapOr(firstResult, registry);
  const secondResult = OperatorRegistry.register(
    firstRegistry,
    "rg",
    secondHandler,
  );
  const secondRegistry = unwrapOr(secondResult, firstRegistry);

  expect(secondResult.ok).toBe(false);
  expect(OperatorRegistry.lookup(secondRegistry, "rg")).toEqual({
    some: true,
    value: firstHandler,
  });
});

test("空文字operator名は妥当性検証せず通常keyとして登録する", () => {
  const registry = OperatorRegistry.create();

  const result = OperatorRegistry.register(registry, "", firstHandler);
  const updated = unwrapOr(result, registry);

  expect(result.ok).toBe(true);
  expect(OperatorRegistry.has(updated, "")).toBe(true);
});
