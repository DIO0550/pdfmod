import { expect, test } from "vitest";
import { ok } from "../../../utils/result/index";
import { type OperatorHandler, OperatorRegistry } from "../index";

const ALL_BUILTIN_OPERATORS = [
  // Color (6)
  "G",
  "g",
  "RG",
  "rg",
  "K",
  "k",
  // Graphics State (10)
  "cm",
  "w",
  "J",
  "j",
  "M",
  "d",
  "ri",
  "i",
  "q",
  "Q",
  // Marked Content (5)
  "BMC",
  "EMC",
  "BDC",
  "MP",
  "DP",
  // Path (19)
  "m",
  "l",
  "c",
  "v",
  "y",
  "h",
  "re",
  "W",
  "W*",
  "S",
  "s",
  "f",
  "F",
  "f*",
  "B",
  "B*",
  "b",
  "b*",
  "n",
  // Text Positioning (4)
  "Td",
  "TD",
  "Tm",
  "T*",
  // Text Showing (4)
  "Tj",
  "TJ",
  "'",
  '"',
  // Text State (9)
  "BT",
  "ET",
  "Tf",
  "Tc",
  "Tw",
  "Tz",
  "TL",
  "Tr",
  "Ts",
  // XObject (1)
  "Do",
] as const;

test("OperatorRegistry.createDefault は全ビルトインオペレータ登録済みレジストリを返す", () => {
  const result = OperatorRegistry.createDefault();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const registry = result.value;

  for (const name of ALL_BUILTIN_OPERATORS) {
    expect(OperatorRegistry.has(registry, name)).toBe(true);
    const lookupResult = OperatorRegistry.lookup(registry, name);
    expect(lookupResult.some).toBe(true);
  }
});

test("テキスト位置指定オペレータ (Td, TD, Tm, T*) がデフォルトレジストリに登録されている", () => {
  const result = OperatorRegistry.createDefault();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const registry = result.value;

  expect(OperatorRegistry.has(registry, "Td")).toBe(true);
  expect(OperatorRegistry.has(registry, "TD")).toBe(true);
  expect(OperatorRegistry.has(registry, "Tm")).toBe(true);
  expect(OperatorRegistry.has(registry, "T*")).toBe(true);
});

test("グラフィックス状態オペレータ (q, Q, cm, w, J, j, M, d, ri, i) がデフォルトレジストリに登録されている", () => {
  const result = OperatorRegistry.createDefault();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const registry = result.value;

  const graphicsOps = [
    "q",
    "Q",
    "cm",
    "w",
    "J",
    "j",
    "M",
    "d",
    "ri",
    "i",
  ] as const;
  for (const op of graphicsOps) {
    expect(OperatorRegistry.has(registry, op)).toBe(true);
  }
});

test("未登録の未知オペレータ名は has で false を返し lookup で none を返す", () => {
  const result = OperatorRegistry.createDefault();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const registry = result.value;

  expect(OperatorRegistry.has(registry, "UNKNOWN_OP")).toBe(false);
  expect(OperatorRegistry.lookup(registry, "UNKNOWN_OP")).toEqual({
    some: false,
  });
});

test("デフォルトレジストリを複数回生成しても互いに独立した新しいレジストリが返る", () => {
  const firstResult = OperatorRegistry.createDefault();
  const secondResult = OperatorRegistry.createDefault();

  expect(firstResult.ok).toBe(true);
  expect(secondResult.ok).toBe(true);
  if (!firstResult.ok || !secondResult.ok) {
    return;
  }

  expect(firstResult.value).not.toBe(secondResult.value);

  const customHandler: OperatorHandler = (context) => ok(context);
  const registerResult = OperatorRegistry.register(
    firstResult.value,
    "customOp",
    customHandler,
  );
  expect(registerResult.ok).toBe(true);
  if (!registerResult.ok) {
    return;
  }

  expect(OperatorRegistry.has(registerResult.value, "customOp")).toBe(true);
  expect(OperatorRegistry.has(firstResult.value, "customOp")).toBe(false);
  expect(OperatorRegistry.has(secondResult.value, "customOp")).toBe(false);
});

test("デフォルトレジストリにカスタムオペレータを追加登録して拡張できる", () => {
  const result = OperatorRegistry.createDefault();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const registry = result.value;

  const customHandler: OperatorHandler = (context) => ok(context);
  const extendedResult = OperatorRegistry.register(
    registry,
    "customOp",
    customHandler,
  );

  expect(extendedResult.ok).toBe(true);
  if (!extendedResult.ok) {
    return;
  }
  const extended = extendedResult.value;

  expect(OperatorRegistry.has(extended, "customOp")).toBe(true);
  expect(OperatorRegistry.has(extended, "q")).toBe(true);
  expect(OperatorRegistry.has(extended, "Td")).toBe(true);
  expect(OperatorRegistry.lookup(extended, "customOp")).toEqual({
    some: true,
    value: customHandler,
  });
});

test("デフォルトレジストリに登録済みのオペレータを再登録しようとするとエラーを返す", () => {
  const result = OperatorRegistry.createDefault();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const registry = result.value;

  const dummyHandler: OperatorHandler = (context) => ok(context);
  const duplicateResult = OperatorRegistry.register(
    registry,
    "q",
    dummyHandler,
  );

  expect(duplicateResult).toEqual({
    ok: false,
    error: {
      code: "OPERATOR_ALREADY_REGISTERED",
      message: "Operator is already registered: q",
      operatorName: "q",
    },
  });
});
