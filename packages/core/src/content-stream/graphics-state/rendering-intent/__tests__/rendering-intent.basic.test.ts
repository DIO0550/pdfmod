import { expect, test } from "vitest";
import { RenderingIntent } from "../index";

test("create は渡された文字列を持つ RenderingIntent を生成する", () => {
  const intent = RenderingIntent.create("RelativeColorimetric");
  expect(intent).toBe("RelativeColorimetric");
});

test("create は任意の文字列を RenderingIntent として受け入れる", () => {
  const custom = RenderingIntent.create("CustomIntent");
  expect(custom).toBe("CustomIntent");
});
