import { expect, test } from "vitest";
import type {
  PdfDictionary,
  PdfName,
} from "../../../../pdf/types/pdf-types/index";
import { none, some } from "../../../../utils/option/index";
import { type MarkedContentEntry, MarkedContentStack } from "../../index";

const spanTag: PdfName = { type: "name", value: "Span" };
const artifactTag: PdfName = { type: "name", value: "Artifact" };
const emptyDict: PdfDictionary = { type: "dictionary", entries: new Map() };
const bmcSpan: MarkedContentEntry = { tag: spanTag, properties: none };
const bmcArtifact: MarkedContentEntry = { tag: artifactTag, properties: none };
const bdcSpan: MarkedContentEntry = {
  tag: spanTag,
  properties: some(emptyDict),
};

test("createは深さ0の空stackを返す", () => {
  // create() 直後の stack は深さ 0 (entry が積まれていない初期状態)
  const stack = MarkedContentStack.create();
  expect(MarkedContentStack.depth(stack)).toBe(0);
});

test("pushは深さを1増やした新stackを返す", () => {
  // BMC entry を 1 つ push したら depth が 0 → 1 に増加する
  const stack = MarkedContentStack.push(MarkedContentStack.create(), bmcSpan);
  expect(MarkedContentStack.depth(stack)).toBe(1);
});

test("pushは元stackをmutateせず別参照を返す", () => {
  // push は元 stack を変更せず、別参照の stack を返す不変更新であること
  const prev = MarkedContentStack.create();
  const next = MarkedContentStack.push(prev, bmcSpan);
  expect(next).not.toBe(prev);
  expect(MarkedContentStack.depth(prev)).toBe(0);
});

test("LIFO順でpopが直近pushしたentryを返す", () => {
  // push(span) → push(artifact) で depth = 2 を確認した上で
  // pop は LIFO で最後に push した artifact から取り出す
  const s1 = MarkedContentStack.push(MarkedContentStack.create(), bmcSpan);
  const s2 = MarkedContentStack.push(s1, bmcArtifact);
  expect(MarkedContentStack.depth(s2)).toBe(2);

  const first = MarkedContentStack.pop(s2);
  expect(first).toEqual({
    some: true,
    value: { stack: expect.any(Object), popped: bmcArtifact },
  });
  if (!first.some) {
    throw new Error("expected some");
  }
  const second = MarkedContentStack.pop(first.value.stack);
  expect(second).toEqual({
    some: true,
    value: { stack: expect.any(Object), popped: bmcSpan },
  });
});

test("popは元stackをmutateせず別参照のstackを返す", () => {
  // pop 後も元 stack の depth が変わらず、別参照の stack を返す
  const prev = MarkedContentStack.push(MarkedContentStack.create(), bmcSpan);
  const result = MarkedContentStack.pop(prev);
  if (!result.some) {
    throw new Error("expected some");
  }
  expect(result.value.stack).not.toBe(prev);
  expect(MarkedContentStack.depth(prev)).toBe(1);
});

test("BDC entry(propertiesがsome)もpushしてpopで同じ参照が返る", () => {
  // BDC 由来 entry (properties が some) も配列に不変参照として保持され、
  // pop で同じ entry 参照が返ること
  const stack = MarkedContentStack.push(MarkedContentStack.create(), bdcSpan);
  const result = MarkedContentStack.pop(stack);
  if (!result.some) {
    throw new Error("expected some");
  }
  expect(result.value.popped).toBe(bdcSpan);
});
