import { expect, test } from "vitest";
import { TrappedState } from "./document-metadata";

test.each([
  ["True"],
  ["False"],
  ["Unknown"],
])("TrappedState.create returns Ok for %s", (s) => {
  const result = TrappedState.create(s);
  expect(result).toStrictEqual({ ok: true, value: s });
});

test.each([
  ["Yes"],
  ["true"],
  ["false"],
  ["unknown"],
  [""],
])("TrappedState.create returns Err for %s", (s) => {
  const result = TrappedState.create(s);
  expect(result.ok).toBe(false);
});

test("TrappedState.create Err message lists supported values", () => {
  const result = TrappedState.create("Yes");
  expect(result).toStrictEqual({
    ok: false,
    error: 'Invalid TrappedState: "Yes" (supported: True, False, Unknown)',
  });
});
