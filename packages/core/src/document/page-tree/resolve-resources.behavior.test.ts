import { expect, test } from "vitest";
import type { PdfDictionary, PdfValue } from "../../pdf/types/pdf-types/index";
import type { InheritedAttrs } from "./inheritance-resolver";
import { makePageDict, okDict } from "./page-tree-walker.test.helpers";
import { resolveResources } from "./resolve-resources";

const NO_INHERIT: InheritedAttrs = {};

test("/Resources キー有り・pageLeaf.resources 有りで pageLeaf.resources を返す", () => {
  const leafResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F1" }]]),
  );
  const dict = makePageDict({ resources: leafResources });
  const pageLeaf: InheritedAttrs = { resources: leafResources };
  expect(resolveResources(dict, NO_INHERIT, pageLeaf)).toBe(leafResources);
});

test("/Resources キー有り・pageLeaf.resources undefined で空辞書を返す", () => {
  const dict = makePageDict({
    resources: okDict(new Map<string, PdfValue>()),
  });
  const out = resolveResources(dict, NO_INHERIT, NO_INHERIT);
  expect(out.type).toBe("dictionary");
  expect(out.entries.size).toBe(0);
});

test("/Resources キー無し・inherited.resources 有りで inherited.resources を返す", () => {
  const inheritedResources = okDict(
    new Map<string, PdfValue>([["XObject", { type: "name", value: "X1" }]]),
  );
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { resources: inheritedResources };
  expect(resolveResources(dict, inherited, NO_INHERIT)).toBe(
    inheritedResources,
  );
});

test("/Resources キー無し・両 undefined で空辞書を返す", () => {
  const dict = makePageDict({});
  const out = resolveResources(dict, NO_INHERIT, NO_INHERIT);
  expect(out.type).toBe("dictionary");
  expect(out.entries.size).toBe(0);
});

test("空辞書フォールバック時に毎回別インスタンスを返す（cross-page contamination 防止）", () => {
  const dict = makePageDict({});
  const out1: PdfDictionary = resolveResources(dict, NO_INHERIT, NO_INHERIT);
  const out2: PdfDictionary = resolveResources(dict, NO_INHERIT, NO_INHERIT);
  expect(out1).not.toBe(out2);
  expect(out1.entries).not.toBe(out2.entries);
});
