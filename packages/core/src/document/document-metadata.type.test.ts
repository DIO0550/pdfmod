import { expect, test } from "vitest";
import type { DocumentMetadata, TrappedState } from "./document-metadata";

test("DocumentMetadata は全フィールド optional で空オブジェクトが代入可能", () => {
  const metadata: DocumentMetadata = {};
  expect(metadata).toEqual({});
});

test("TrappedState は 'True' | 'False' | 'Unknown' のリテラルユニオン", () => {
  const a: TrappedState = "True";
  const b: TrappedState = "False";
  const c: TrappedState = "Unknown";
  expect([a, b, c]).toEqual(["True", "False", "Unknown"]);
});

test("DocumentMetadata は title / author / subject / keywords / creator / producer / creationDate / modDate / trapped を持つ", () => {
  const metadata: DocumentMetadata = {
    title: "T",
    author: "A",
    subject: "S",
    keywords: "K",
    creator: "C",
    producer: "P",
    creationDate: new Date(2023, 0, 1),
    modDate: new Date(2024, 0, 1),
    trapped: "True",
  };
  expect(metadata.title).toBe("T");
  expect(metadata.trapped).toBe("True");
});
