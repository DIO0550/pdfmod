import { assert, expect, test } from "vitest";
import { none } from "../../../utils/option/index";
import { GraphicsStateStack } from "../../graphics-state/index";
import type { MarkedContentEntry } from "../../marked-content/stack";
import { MarkedContentStack } from "../../marked-content/stack";
import { OperandStack } from "../../operand-stack/index";
import type { OperatorHandlerContext } from "../../operator-registry/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { registerMarkedContentOperators } from "../../operators/marked-content/marked-content-operators/index";
import { ContentStreamInterpreter } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * marked-content operator を registerMarkedContentOperators で登録した registry を生成する。
 */
const buildRegistry = (): OperatorRegistry => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());
  assert(registered.ok);
  return registered.value;
};

test("`/Span BMC EMC` が ok で完走し warnings 空・末尾 depth 0", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC EMC"),
    registry: buildRegistry(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("ネスト `/Span BMC /Foo BMC EMC EMC` が LIFO で巻き戻り末尾 depth 0", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC /Foo BMC EMC EMC"),
    registry: buildRegistry(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("`EMC` 単独で execute が err（OPERATOR_ILLEGAL_STATE）を返す", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("EMC"),
    registry: buildRegistry(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("`/Span BMC`（EMC 無し）で末尾 OBJECT_PARSE_UNTERMINATED（depth=1・message pin down）", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC"),
    registry: buildRegistry(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.message).toBe(
    "Unterminated marked-content sequence(s): depth=1, last tag=/Span",
  );
});

test("ネスト未閉じ `/Span BMC /Foo BMC` で depth=2・last tag=/Foo の OBJECT_PARSE_UNTERMINATED", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC /Foo BMC"),
    registry: buildRegistry(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.message).toBe(
    "Unterminated marked-content sequence(s): depth=2, last tag=/Foo",
  );
});

test("`/T <</MCID 0>> BDC EMC` で 1 段開閉が完了する（dict properties）", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/T <</MCID 0>> BDC EMC"),
    registry: buildRegistry(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("`/T /MC0 BDC EMC` で 1 段開閉が完了する（name properties、resource 解決しない）", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/T /MC0 BDC EMC"),
    registry: buildRegistry(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("`/A BMC /B <<>> BDC EMC EMC` で BMC → BDC → EMC → EMC が LIFO で閉じる", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/A BMC /B <<>> BDC EMC EMC"),
    registry: buildRegistry(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("`/A <<>> BDC /B BMC EMC EMC` で BDC → BMC → EMC → EMC が LIFO で閉じる", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/A <<>> BDC /B BMC EMC EMC"),
    registry: buildRegistry(),
  });

  assert(result.ok);
  expect(result.value.warnings).toHaveLength(0);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test('`data: ""` + 非空 initialContext（depth=1, tag /Span）で OBJECT_PARSE_UNTERMINATED', () => {
  const seededEntry: MarkedContentEntry = {
    tag: { type: "name", value: "Span" },
    properties: none,
  };
  const initialContext: OperatorHandlerContext = {
    operandStack: OperandStack.create(),
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.push(
      MarkedContentStack.create(),
      seededEntry,
    ),
  };

  const result = ContentStreamInterpreter.execute({
    data: encode(""),
    registry: OperatorRegistry.create(),
    initialContext,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.message).toBe(
    "Unterminated marked-content sequence(s): depth=1, last tag=/Span",
  );
});
