import { assert, expect, test } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import {
  ContentStreamInterpreter,
  type ContentStreamInterpreterResult,
  ContentStreamResources,
  GraphicsStateStack,
  OperandStack,
  OperatorRegistry,
  type PdfError,
  Result,
} from "../../../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

function form(content: string, attributes = ""): string {
  return `<< /Type /XObject /Subtype /Form /BBox [0 0 40 20] /Length ${encode(content).length} ${attributes} >>\nstream\n${content}\nendstream`;
}

function image(width = 3): string {
  const data = "0 w".padEnd(width, " ");
  return `<< /Type /XObject /Subtype /Image /Width ${width} /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${data.length} >>\nstream\n${data}\nendstream`;
}

async function execute(
  source: Parameters<typeof setupResources>[0],
  content: string,
): Promise<Result.Result<ContentStreamInterpreterResult, PdfError>> {
  const { resources, resolveRef } = setupResources(source);
  const prepared = await ContentStreamResources.fromResources(
    resources,
    resolveRef,
  );
  return ContentStreamInterpreter.execute({
    data: encode(content),
    resources: prepared,
  });
}

test("Form の描画命令を実行し、画像のバイト列を描画対象として保持する", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 2 0 R >> >>",
      objects: [form("3 w /Im0 Do"), image()],
    },
    "/Logo Do /Im0 Do",
  );

  assert(result.ok);
  expect(
    result.value.images.map(({ name, graphicsState }) => ({
      name,
      lineWidth: graphicsState.lineWidth,
    })),
  ).toEqual([
    { name: "Im0", lineWidth: 3 },
    { name: "Im0", lineWidth: 1 },
  ]);
  expect(result.value.images[0]?.image.stream.data).toEqual(encode("0 w"));
  expect(result.value.warnings).toEqual([]);
});

test("入れ子の Form はそれぞれの辞書で同名リソースを解決する", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 4 0 R >> >>",
      objects: [
        form(
          "/Im0 Do /Inner Do /Im0 Do",
          "/Resources << /XObject << /Inner 2 0 R /Im0 3 0 R >> >>",
        ),
        form("/Im0 Do", "/Resources 6 0 R"),
        image(3),
        image(4),
        image(5),
        "<< /XObject << /Im0 5 0 R >> >>",
      ],
    },
    "/Logo Do /Im0 Do",
  );

  assert(result.ok);
  expect(result.value.images.map(({ image }) => image.width)).toEqual([
    { some: true, value: 3 },
    { some: true, value: 5 },
    { some: true, value: 3 },
    { some: true, value: 4 },
  ]);
});

test("リソースを省略した Form は直近の呼び出し元の辞書を使う", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 4 0 R >> >>",
      objects: [
        form(
          "/Inner Do",
          "/Resources << /XObject << /Inner 2 0 R /Im0 3 0 R >> >>",
        ),
        form("/Im0 Do"),
        image(3),
        image(4),
      ],
    },
    "/Logo Do",
  );

  assert(result.ok);
  expect(result.value.images.map(({ image }) => image.width)).toEqual([
    { some: true, value: 3 },
  ]);
});

test("空の Form リソース辞書は呼び出し元の名前を継承しない", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 2 0 R >> >>",
      objects: [form("/Im0 Do", "/Resources << >>"), image()],
    },
    "/Logo Do /Im0 Do",
  );

  assert(result.ok);
  expect(result.value.images.map(({ name }) => name)).toEqual(["Im0"]);
  expect(result.value.warnings).toMatchObject([
    {
      code: "XOBJECT_NOT_FOUND",
      offset: 6,
      message: expect.stringContaining("Form /Logo (byte 5)"),
    },
  ]);
});

test("Form の行列を CTM に連結し、BBox と既存のクリップを交差させる", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 2 0 R >> >>",
      objects: [
        form("1 0 0 1 1 1 cm /Im0 Do", "/Matrix [0 1 -1 0 10.5 5]"),
        image(),
      ],
    },
    "0 0 50 50 re W n 2 0 0 3 100 200 cm /Logo Do /Im0 Do",
  );

  assert(result.ok);
  const [inner, outer] = result.value.images;
  expect(inner?.graphicsState.ctm).toEqual([0, 3, -2, 0, 119, 218]);
  expect(inner?.graphicsState.clippingPath).toEqual({
    some: true,
    value: {
      path: { segments: [{ kind: "rect", x: 0, y: 0, width: 40, height: 20 }] },
      rule: "nonzero",
      ctm: [0, 3, -2, 0, 121, 215],
      previous: outer?.graphicsState.clippingPath,
    },
  });
  expect(outer?.graphicsState.clippingPath).toMatchObject({
    some: true,
    value: { ctm: [1, 0, 0, 1, 0, 0], previous: { some: false } },
  });
});

test("Form 内の余分な Q と未復元の q を呼び出し元から隔離する", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 2 0 R >> >>",
      objects: [form("Q /Im0 Do 7 w q 8 w /Im0 Do"), image()],
    },
    "4 w q 5 w /Logo Do /Im0 Do Q /Im0 Do",
  );

  assert(result.ok);
  expect(
    result.value.images.map(({ graphicsState }) => graphicsState.lineWidth),
  ).toEqual([5, 8, 5, 4]);
  expect(result.value.context.graphicsStateStack.saved).toHaveLength(0);
});

test("Form のオペランドとマーク付きコンテンツを独立したストリームとして扱う", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 2 0 R >> >>",
      objects: [form("/Inner BMC /Im0 Do EMC 9"), image()],
    },
    "/Outer BMC 4 /Logo Do w EMC",
  );

  assert(result.ok);
  expect(
    GraphicsStateStack.current(result.value.context.graphicsStateStack)
      .lineWidth,
  ).toBe(4);
  expect(OperandStack.depth(result.value.context.operandStack)).toBe(0);
  expect(result.value.images.map(({ name }) => name)).toEqual(["Im0"]);
});

test("同じレジストリで Form 内のカスタム命令を実行する", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /XObject << /Logo 1 0 R >> >>",
    objects: [form("custom")],
  });
  const prepared = await ContentStreamResources.fromResources(
    resources,
    resolveRef,
  );
  const defaults = OperatorRegistry.createDefault();
  assert(defaults.ok);
  const registry = OperatorRegistry.register(
    defaults.value,
    "custom",
    (context) =>
      Result.ok({
        ...context,
        warnings: [{ code: "UNKNOWN_OPERATOR", message: "custom ran" }],
      }),
  );
  assert(registry.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("/Logo Do"),
    resources: prepared,
    registry: registry.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([
    {
      code: "UNKNOWN_OPERATOR",
      message: "Form /Logo (byte 0): custom ran",
      offset: 6,
    },
  ]);
});

test("FlateDecode の Form は実行前に命令列を復号する", async () => {
  const input = new Blob(["6 w /Im0 Do"]);
  const compressed = await new Response(
    input.stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer();
  const header = `<< /Subtype /Form /BBox [0 0 40 20] /Length ${compressed.byteLength} /Filter [3 0 R] /DecodeParms [null] >>\nstream\n`;
  const footer = "\nendstream";
  const body = await new Blob([header, compressed, footer]).arrayBuffer();
  const stream = new Uint8Array(body);

  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Im0 2 0 R >> >>",
      objects: [stream, image(), "/FlateDecode"],
    },
    "/Logo Do",
  );

  assert(result.ok);
  expect(
    result.value.images.map(({ graphicsState }) => graphicsState.lineWidth),
  ).toEqual([6]);
  expect(result.value.warnings).toEqual([]);
});

test("別名の自己参照を打ち切り、同じ Form の次の呼び出しは実行する", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R /Alias 1 0 R /Im0 2 0 R >> >>",
      objects: [form("/Alias Do /Im0 Do"), image()],
    },
    "/Logo Do /Logo Do",
  );

  assert(result.ok);
  expect(
    result.value.warnings.map(({ code, offset }) => [code, offset]),
  ).toEqual([
    ["FORM_XOBJECT_CYCLE", 6],
    ["FORM_XOBJECT_CYCLE", 15],
  ]);
  expect(result.value.images.map(({ name }) => name)).toEqual(["Im0", "Im0"]);
});

test("Form が別々の辞書から互いを参照する場合も循環を打ち切る", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /A 1 0 R /Im0 3 0 R >> >>",
      objects: [
        form("/B Do", "/Resources << /XObject << /B 2 0 R >> >>"),
        form("/BackToA Do", "/Resources << /XObject << /BackToA 1 0 R >> >>"),
        image(),
      ],
    },
    "/A Do /Im0 Do",
  );

  assert(result.ok);
  expect(result.value.warnings).toMatchObject([
    {
      code: "FORM_XOBJECT_CYCLE",
      offset: 3,
      message: expect.stringContaining("Form /BackToA"),
    },
  ]);
  expect(result.value.images.map(({ name }) => name)).toEqual(["Im0"]);
});

test("Form の実行を32段まで許可し、33段目を飛ばす", async () => {
  const length = 33;
  const names = Array.from(
    { length },
    (_, index) => `/F${index + 1} ${index + 1} 0 R`,
  ).join(" ");
  const forms = Array.from({ length }, (_, index) => {
    const next = index + 2;
    const draw = `${index + 1} w /Im0 Do`;
    return form(next <= length ? `${draw} /F${next} Do` : draw);
  });

  const result = await execute(
    {
      resources: `<< /XObject << ${names} /Im0 34 0 R >> >>`,
      objects: [...forms, image()],
    },
    "/F1 Do /Im0 Do",
  );

  assert(result.ok);
  const widths = result.value.images.map(
    ({ graphicsState }) => graphicsState.lineWidth,
  );
  expect(widths).toEqual([
    ...Array.from({ length: 32 }, (_, index) => index + 1),
    1,
  ]);
  expect(result.value.warnings).toMatchObject([
    {
      code: "FORM_XOBJECT_TOO_DEEP",
      offset: 4,
      message: expect.stringContaining("Form /F33"),
    },
  ]);
});

test.each([
  [
    "欠落した BBox",
    "<< /Subtype /Form /Length 7 >>\nstream\n/Im0 Do\nendstream",
    "/BBox",
  ],
  ["不正な Resources", form("/Im0 Do", "/Resources 42"), "/Resources"],
  [
    "未対応の Filter",
    form("/Im0 Do", "/Filter /DCTDecode"),
    "PDF_FILTER_UNSUPPORTED",
  ],
  [
    "壊れた FlateDecode",
    form("/Im0 Do", "/Filter /FlateDecode"),
    "FLATEDECODE_FAILED",
  ],
])("%s を持つ Form だけを警告して飛ばす", async (_label, broken, reason) => {
  const result = await execute(
    {
      resources: "<< /XObject << /Bad 1 0 R /Im0 2 0 R >> >>",
      objects: [broken, image()],
    },
    "/Bad Do /Im0 Do",
  );

  assert(result.ok);
  expect(result.value.warnings).toMatchObject([
    {
      code: "FORM_XOBJECT_PREPARE_FAILED",
      offset: 5,
      message: expect.stringContaining(reason),
    },
  ]);
  expect(result.value.images.map(({ name }) => name)).toEqual(["Im0"]);
});

test("Form の命令のオペランドエラーを呼び出し元へ返す", async () => {
  const result = await execute(
    {
      resources: "<< /XObject << /Logo 1 0 R >> >>",
      objects: [form("w")],
    },
    "/Logo Do",
  );

  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "OPERATOR_OPERAND_MISSING",
      operatorName: "w",
      message: expect.stringContaining("Form /Logo"),
    },
  });
});
