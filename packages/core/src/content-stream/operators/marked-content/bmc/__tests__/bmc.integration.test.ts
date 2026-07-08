import { assert, expect, test } from "vitest";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { emcHandler } from "../../emc/index";
import { bmcHandler } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * BMC / EMC handler を登録した registry を生成する。
 * BMC で開いた marked-content を EMC で閉じ、末尾 depth 0 の妥当な stream を
 * end-to-end で実行するため両 operator を登録する。
 */
const buildRegistry = (): OperatorRegistry => {
  const withBmc = OperatorRegistry.register(
    OperatorRegistry.create(),
    "BMC",
    bmcHandler,
  );
  assert(withBmc.ok);
  const withEmc = OperatorRegistry.register(withBmc.value, "EMC", emcHandler);
  assert(withEmc.ok);
  return withEmc.value;
};

test("BMC で開いた 1 段を EMC で閉じると ok で完走し末尾 depth 0 になる", () => {
  const registry = buildRegistry();
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC EMC"),
    registry,
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("BMC が operand の name (/Span) を tag として push する（未閉じ EOF の未閉じ tag で確認）", () => {
  const registry = buildRegistry();
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC"),
    registry,
  });

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.message).toBe(
    "Unterminated marked-content sequence(s): depth=1, last tag=/Span",
  );
});

test("ネスト BMC/BMC で 2 段開き、2 段の EMC で閉じると ok で完走し末尾 depth 0 になる", () => {
  const registry = buildRegistry();
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span /Foo BMC BMC EMC EMC"),
    registry,
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});
