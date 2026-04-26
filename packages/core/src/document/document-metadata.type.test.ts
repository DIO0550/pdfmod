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
