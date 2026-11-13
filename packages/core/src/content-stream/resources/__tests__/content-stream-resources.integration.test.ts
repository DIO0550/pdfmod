import { assert, expect, test } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import {
  ContentStreamInterpreter,
  type ContentStreamInterpreterResult,
  ContentStreamResources,
  ExtGStateResources,
  GraphicsStateStack,
  OperandStack,
  OperatorRegistry,
  Result,
} from "../../../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

async function prepare(
  source: Parameters<typeof setupResources>[0],
): Promise<ContentStreamResources> {
  const { resources, resolveRef } = setupResources(source);
  return ContentStreamResources.fromResources(resources, resolveRef);
}

test("Tf・Do・gs が同じスコープの間接参照を引き、Q は描画状態だけを復元する", async () => {
  const resources = await prepare({
    resources:
      "<< /Font 1 0 R /XObject << /Im0 3 0 R >> /ExtGState << /GS1 4 0 R >> >>",
    objects: [
      "<< /F1 2 0 R >>",
      "<< /Type /Font /BaseFont /Courier >>",
      "<< /Subtype /Image /Width 1 /Height 1 /Length 1 >>\nstream\nA\nendstream",
      "<< /LW 5 /ca .4 >>",
    ],
  });
  const defaults = OperatorRegistry.createDefault();
  assert(defaults.ok);
  const registry = OperatorRegistry.register(
    defaults.value,
    "inspect",
    (context) => {
      const image = context.resources?.getXObject("Im0");
      assert(image?.ok && image.value.some);
      assert(image.value.value.subtype === "Image");
      expect(image.value.value.stream.data).toEqual(encode("A"));
      expect(image.value.value.width).toEqual({ some: true, value: 1 });
      expect(
        GraphicsStateStack.current(context.graphicsStateStack),
      ).toMatchObject({
        lineWidth: 5,
        fillAlpha: 0.4,
      });

      return Result.ok({
        operandStack: context.operandStack,
        graphicsStateStack: context.graphicsStateStack,
        markedContentStack: context.markedContentStack,
      });
    },
  );
  assert(registry.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("q /GS1 gs /Im0 Do inspect Q BT /F1 12 Tf ET"),
    registry: registry.value,
    resources,
  });

  assert(result.ok);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(state.lineWidth).toBe(1);
  expect(state.fillAlpha).toBe(1);
  expect(state.textState.font).toMatchObject({
    some: true,
    value: {
      type: "name",
      name: "F1",
      dictionary: {
        entries: new Map([
          ["Type", { type: "name", value: "Font" }],
          ["BaseFont", { type: "name", value: "Courier" }],
        ]),
      },
    },
  });
  expect(state.textState.fontName).toEqual({ some: true, value: "F1" });
  expect(state.textState.fontSize).toBe(12);
  expect(result.value.context.resources).toBe(resources);
  expect(result.value.warnings).toEqual([]);
});

test("色空間・パターン・シェーディングも実行スコープから引ける", async () => {
  const resources = await prepare({
    resources:
      "<< /ColorSpace << /LocalRGB /DeviceRGB >> /Pattern << /P1 << /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB >> >> >> /Shading << /S1 << /ShadingType 2 /ColorSpace /DeviceRGB >> >> /Properties << /Tag << /MCID 1 >> >> >>",
  });

  const result = ContentStreamInterpreter.execute({
    data: encode("/LocalRGB CS .1 .2 .3 SC /Pattern cs /P1 scn /S1 sh"),
    resources,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack),
  ).toMatchObject({
    strokeColorSpace: "DeviceRGB",
    fillColorSpace: { family: "Pattern" },
  });
  expect(result.value.context.resources?.getProperties("Tag")).toMatchObject({
    ok: true,
    value: { some: true, value: { type: "dictionary" } },
  });
});

test("壊れたカテゴリや名前は使用した命令位置にだけ警告し、後続の命令を実行する", async () => {
  const resources = await prepare({
    resources:
      "<< /Font << /Bad 1 0 R /Unused 1 0 R /Good << /Type /Font >> >> /XObject 1 0 R /ExtGState << /Bad 1 0 R /Good << /LW 6 >> >> /ColorSpace 1 0 R /Pattern 1 0 R /Shading << /Bad 1 0 R /Good << /ShadingType 2 /ColorSpace /DeviceGray >> >> >>",
    objects: ["<< /Broken"],
  });
  const operations = [
    "/Bad 12 Tf",
    "/Bad Do",
    "/Bad gs",
    "/Bad cs",
    "/Bad scn",
    "/Bad sh",
  ];
  const categories = [
    "Font",
    "XObject",
    "ExtGState",
    "ColorSpace",
    "Pattern",
    "Shading",
  ];
  const content =
    "/Bad 12 Tf /Bad Do /Bad gs /Bad cs .2 .4 sc /Pattern cs /Bad scn /Bad sh /Good 14 Tf /Good gs /Good sh";

  const result = ContentStreamInterpreter.execute({
    data: encode(content),
    resources,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual(
    operations.map((operation, index) => ({
      code: "RESOURCES_RESOLVE_FAILED",
      offset: content.indexOf(operation) + operation.lastIndexOf(" ") + 1,
      message: expect.stringContaining(
        `/${categories[index]} /Bad: OBJECT_PARSE_UNEXPECTED_TOKEN`,
      ),
    })),
  );
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(state.lineWidth).toBe(6);
  expect(state.textState.fontName).toEqual({ some: true, value: "Good" });
  expect(state.textState.fontSize).toBe(14);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
});

test("不在・型違いのリソースを警告し、Tf の名前とサイズを保持する", async () => {
  const resources = await prepare({
    resources: "<< /Font << /Known << /Type /Font >> /F1 42 >> >>",
  });

  const result = ContentStreamInterpreter.execute({
    data: encode("3 Tc /Known 10 Tf /F1 12 Tf /Im0 Do /GS1 gs 7 w"),
    resources,
  });

  assert(result.ok);
  expect(result.value.warnings.map(({ code }) => code)).toEqual([
    "FONT_NOT_FOUND",
    "XOBJECT_NOT_FOUND",
    "EXT_GSTATE_NOT_FOUND",
  ]);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(state.lineWidth).toBe(7);
  expect(state.textState.font).toEqual({
    some: true,
    value: { type: "name", name: "F1" },
  });
  expect(state.textState).toMatchObject({
    fontSize: 12,
    charSpace: 3,
  });
});

test("スコープを省略した従来の Tf・Do・gs を実行できる", () => {
  const result = ContentStreamInterpreter.execute({
    data: encode("/F1 12 Tf /Im0 Do /GS1 gs 7 w"),
  });

  assert(result.ok);
  expect(result.value.warnings.map(({ code }) => code)).toEqual([
    "EXT_GSTATE_NOT_FOUND",
  ]);
  const state = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(state.lineWidth).toBe(7);
  expect(state.textState.font).toEqual({
    some: true,
    value: { type: "name", name: "F1" },
  });
});

test("実行ごとのスコープは初期 context と従来の registry 設定から独立する", async () => {
  const { resources: source, resolveRef } = setupResources({
    resources: "<< /ExtGState << /GS << /LW 9 >> >> >>",
  });
  const states = await ExtGStateResources.fromResources(source, resolveRef);
  assert(states.ok);
  const registry = OperatorRegistry.createDefault(states.value);
  assert(registry.ok);
  const firstScope = await prepare({
    resources: "<< /ExtGState << /GS << /LW 3 >> >> >>",
  });
  const secondScope = await prepare({
    resources: "<< /ExtGState << /GS << /LW 7 >> >> >>",
  });
  const emptyScope = await prepare({ resources: "<< >>" });
  const options = { data: encode("/GS gs"), registry: registry.value };
  const first = ContentStreamInterpreter.execute({
    ...options,
    resources: firstScope,
  });
  assert(first.ok);
  const initialContext = first.value.context;

  const second = ContentStreamInterpreter.execute({
    ...options,
    initialContext,
    resources: secondScope,
  });
  const empty = ContentStreamInterpreter.execute({
    ...options,
    initialContext,
    resources: emptyScope,
  });
  const inherited = ContentStreamInterpreter.execute({
    ...options,
    initialContext,
  });
  const legacy = ContentStreamInterpreter.execute(options);

  assert(second.ok && empty.ok && inherited.ok && legacy.ok);
  const width = (result: ContentStreamInterpreterResult): number =>
    GraphicsStateStack.current(result.context.graphicsStateStack).lineWidth;
  expect(width(first.value)).toBe(3);
  expect(width(second.value)).toBe(7);
  expect(width(empty.value)).toBe(3);
  expect(empty.value.warnings).toMatchObject([
    { code: "EXT_GSTATE_NOT_FOUND" },
  ]);
  expect(width(inherited.value)).toBe(3);
  expect(width(legacy.value)).toBe(9);
  expect(initialContext.resources).toBe(firstScope);
});

test("リソースを指定しても Do の不正なオペランドは実行エラーになる", async () => {
  const resources = await prepare({ resources: "<< >>" });

  const result = ContentStreamInterpreter.execute({
    data: encode("5 Do"),
    resources,
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "OPERATOR_OPERAND_TYPE_MISMATCH", operatorName: "Do" },
  });
});
