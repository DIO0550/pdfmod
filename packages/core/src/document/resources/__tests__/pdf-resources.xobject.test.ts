import { assert, expect, test } from "vitest";
import { ContentStreamTokenizer } from "../../../content-stream/tokenizer/index";
import { TokenType } from "../../../pdf/types/index";
import { none, some } from "../../../utils/option/index";
import { ok } from "../../../utils/result/index";
import { PdfResources } from "../index";
import { setupResources } from "./setup-resources";

/** 辞書と4バイトの未復号データから間接ストリーム本体を作る。 */
function stream(entries: string): string {
  return `<< /Length 4 ${entries} >>\nstream\nDATA\nendstream`;
}

/** カテゴリ辞書とストリームの両方を間接参照する入力を組み立てる。 */
function setupXObject(
  entries: string,
  extra: readonly string[] = [],
): ReturnType<typeof setupResources> {
  return setupResources({
    resources: "<< /XObject 1 0 R >>",
    objects: ["<< /Logo 2 0 R >>", stream(entries), ...extra],
  });
}

test("Do の名前から画像の属性と未復号バイトを取得する", async () => {
  const { resources, resolveRef } = setupXObject(
    "/Subtype /Image /Width 3 0 R /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCII85Decode /DCTDecode] /SMask 4 0 R /Mask [0 0 0 0 0 0]",
    ["12", stream("/Subtype /Image")],
  );
  const tokens = new ContentStreamTokenizer(
    new TextEncoder().encode("/Lo#67o Do"),
  ).tokenize();
  assert(tokens.ok);
  const [name, operator] = tokens.value;
  assert(name.type === TokenType.Name);
  assert(operator.type === TokenType.Operator);
  expect(operator.value).toBe("Do");

  const result = await PdfResources.getXObject(
    resources,
    name.value,
    resolveRef,
  );

  assert(result.ok && result.value.some);
  const image = result.value.value;
  assert(image.subtype === "Image");
  expect(image.width).toEqual(some(12));
  expect(image.height).toEqual(some(2));
  expect(image.bitsPerComponent).toEqual(some(8));
  expect(image.colorSpace).toEqual(some({ type: "name", value: "DeviceRGB" }));
  expect(image.filter).toMatchObject({
    some: true,
    value: {
      type: "array",
      elements: [{ value: "ASCII85Decode" }, { value: "DCTDecode" }],
    },
  });
  expect(image.sMask).toMatchObject({ some: true, value: { type: "stream" } });
  expect(image.mask).toMatchObject({ some: true, value: { type: "array" } });
  expect(image.imageMask).toBe(false);
  expect(image.stream.data).toEqual(new TextEncoder().encode("DATA"));
});

test("ステンシル画像とストリームマスクを識別できる", async () => {
  const { resources, resolveRef } = setupXObject(
    "/Subtype /Image /ImageMask true /Mask 3 0 R",
    [stream("/Subtype /Image /ImageMask true")],
  );
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);
  assert(result.ok && result.value.some);
  const image = result.value.value;
  assert(image.subtype === "Image");
  expect(image.imageMask).toBe(true);
  expect(image.mask).toMatchObject({ some: true, value: { type: "stream" } });
});

test("Form は境界・変換・固有のリソース辞書を持つ", async () => {
  const { resources, resolveRef } = setupXObject(
    "/Subtype /Form /BBox [8 9 -1 0] /Matrix [1 0 0 2 4 0 R 4] /Resources 3 0 R",
    ["<< /Font << >> >>", "3.5"],
  );
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);
  assert(result.ok && result.value.some);
  const form = result.value.value;
  assert(form.subtype === "Form");
  expect(form.bbox).toEqual(some([-1, 0, 8, 9]));
  expect(form.matrix).toEqual([1, 0, 0, 2, 3.5, 4]);
  assert(form.resources.some);
  expect(form.resources.value.entries.has("Font")).toBe(true);
});

test.each([
  "",
  "/BBox [0 0 3]",
  "/BBox [0 0 /Bad 2]",
])("Form の境界が不正でも識別でき、省略行列は単位行列になる %s", async (bbox) => {
  const { resources, resolveRef } = setupXObject(`/Subtype /Form ${bbox}`);
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);
  assert(result.ok && result.value.some);
  const form = result.value.value;
  assert(form.subtype === "Form");
  expect(form.bbox).toEqual(none);
  expect(form.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  expect(form.resources).toEqual(none);
});

test.each([
  ["", { subtype: "Unknown", name: none }],
  ["/Subtype 1", { subtype: "Unknown", name: none }],
  ["/Subtype /Future", { subtype: "Unknown", name: some("Future") }],
  ["/Subtype /PS", { subtype: "PS" }],
])("未対応の種別や省略でも元ストリームを保持する %s", async (entries, expected) => {
  const { resources, resolveRef } = setupXObject(entries);
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);
  assert(result.ok && result.value.some);
  expect(result.value.value).toMatchObject(expected);
  expect(result.value.value.stream.data).toEqual(
    new TextEncoder().encode("DATA"),
  );
});

test.each([
  "<< >>",
  "<< /XObject << /Logo << >> >> >>",
])("名前がないか実体がストリーム以外なら未解決になる %s", async (dictionary) => {
  const { resources, resolveRef } = setupResources({ resources: dictionary });
  expect(await PdfResources.getXObject(resources, "Logo", resolveRef)).toEqual(
    ok(none),
  );
});

test("参照先の構文エラーを呼び出し元へ返す", async () => {
  const { resources, resolveRef } = setupXObject(
    "/Subtype /Form /Resources 3 0 R",
    ["<< /Bad >>"],
  );
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("不正な画像寸法とビット深度は未設定として元辞書を保持する", async () => {
  const { resources, resolveRef } = setupXObject(
    "/Subtype /Image /Width -1 /Height 0 /BitsPerComponent 7",
  );
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);
  assert(result.ok && result.value.some);
  const image = result.value.value;
  assert(image.subtype === "Image");
  expect(image.width).toEqual(none);
  expect(image.height).toEqual(none);
  expect(image.bitsPerComponent).toEqual(none);
  expect(image.stream.dictionary.entries.get("BitsPerComponent")).toEqual({
    type: "integer",
    value: 7,
  });
});

test.each([
  "[1 0 0 1]",
  "[1 0 /Bad 1 0 0]",
])("不正な行列でも正しい境界を取得できる %s", async (matrix) => {
  const { resources, resolveRef } = setupXObject(
    `/Subtype /Form /BBox [0 0 40 20] /Matrix ${matrix}`,
  );
  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);

  assert(result.ok && result.value.some);
  const form = result.value.value;
  assert(form.subtype === "Form");
  expect(form.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  expect(form.bbox).toEqual(some([0, 0, 40, 20]));
});

test("先行オブジェクトに日本語があっても xref から画像に到達する", async () => {
  const { resources, resolveRef } = setupResources({
    resources: "<< /XObject 2 0 R >>",
    objects: [
      "(日本語の文字列)",
      "<< /Logo 3 0 R >> % 画像への参照",
      stream("/Subtype /Image /Width 12"),
    ],
  });

  const result = await PdfResources.getXObject(resources, "Logo", resolveRef);

  assert(result.ok && result.value.some);
  const image = result.value.value;
  assert(image.subtype === "Image");
  expect(image.width).toEqual(some(12));
});
