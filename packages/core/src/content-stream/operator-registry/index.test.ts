import { expect, test } from "vitest";
import type { PdfError } from "../../pdf/errors/index";
import { ok } from "../../utils/result/index";
import { type OperatorHandler, OperatorRegistry } from "./index";

const firstHandler: OperatorHandler = () => ok(undefined);
const secondHandler: OperatorHandler = () => ok(undefined);

test("createしたregistryは未登録operatorを持たない", () => {
  const registry = OperatorRegistry.create();

  expect(OperatorRegistry.has(registry, "m")).toBe(false);
  expect(OperatorRegistry.lookup(registry, "m")).toEqual({ some: false });
});

test("register後lookupはhandlerをsomeで返す", () => {
  const registry = OperatorRegistry.create();

  const error = OperatorRegistry.register(registry, "m", firstHandler);

  expect(error).toEqual({ some: false });
  expect(OperatorRegistry.lookup(registry, "m")).toEqual({
    some: true,
    value: firstHandler,
  });
});

test("register後hasはtrueを返す", () => {
  const registry = OperatorRegistry.create();

  OperatorRegistry.register(registry, "BT", firstHandler);

  expect(OperatorRegistry.has(registry, "BT")).toBe(true);
});

test("異なるoperator名は独立して登録できる", () => {
  const registry = OperatorRegistry.create();

  expect(OperatorRegistry.register(registry, "m", firstHandler)).toEqual({
    some: false,
  });
  expect(OperatorRegistry.register(registry, "l", secondHandler)).toEqual({
    some: false,
  });

  expect(OperatorRegistry.lookup(registry, "m")).toEqual({
    some: true,
    value: firstHandler,
  });
  expect(OperatorRegistry.lookup(registry, "l")).toEqual({
    some: true,
    value: secondHandler,
  });
});

test("同名operatorの重複登録はエラーを返す", () => {
  const registry = OperatorRegistry.create();

  OperatorRegistry.register(registry, "rg", firstHandler);
  const error = OperatorRegistry.register(registry, "rg", secondHandler);

  expect(error).toEqual({
    some: true,
    value: {
      code: "OPERATOR_ALREADY_REGISTERED",
      message: "Operator is already registered: rg",
      operatorName: "rg",
    } satisfies PdfError,
  });
});

test("重複登録後も既存handlerを保持する", () => {
  const registry = OperatorRegistry.create();

  OperatorRegistry.register(registry, "rg", firstHandler);
  OperatorRegistry.register(registry, "rg", secondHandler);

  expect(OperatorRegistry.lookup(registry, "rg")).toEqual({
    some: true,
    value: firstHandler,
  });
});

test("空文字operator名は妥当性検証せず通常keyとして登録する", () => {
  const registry = OperatorRegistry.create();

  const error = OperatorRegistry.register(registry, "", firstHandler);

  expect(error).toEqual({ some: false });
  expect(OperatorRegistry.has(registry, "")).toBe(true);
});
