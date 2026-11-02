import { assert } from "vitest";
import { ObjectParser } from "../../../objects/object-parser/index";
import { ObjectStore } from "../../../objects/object-store/index";
import {
  ByteOffset,
  GenerationNumber,
  ObjectNumber,
  type ResolveRef,
  type XRefEntry,
} from "../../../pdf/types/index";
import { PdfResources } from "../index";

/**
 * 実バイト列からリソース辞書と間接オブジェクトストアを準備する。
 * @param source - リソース辞書のPDF記述と、1番から順に配置するオブジェクト本体
 * @returns リソース辞書と実ストアを使った参照解決関数
 */
export function setupResources(source: {
  readonly resources: string;
  readonly objects?: readonly string[];
}): { readonly resources: PdfResources; readonly resolveRef: ResolveRef } {
  const objects = (source.objects ?? []).map(
    (body, index) => `${index + 1} 0 obj\n${body}\nendobj\n`,
  );
  const entries = objects.map((_, index): [ObjectNumber, XRefEntry] => [
    ObjectNumber.of(index + 1),
    {
      type: 1,
      offset: ByteOffset.of(objects.slice(0, index).join("").length),
      generationNumber: GenerationNumber.of(0),
    },
  ]);
  const store = ObjectStore.create({
    data: new TextEncoder().encode(objects.join("")),
    xref: { entries: new Map(entries), size: objects.length + 1 },
  });
  assert(store.ok);

  const parsed = ObjectParser.parse(
    new TextEncoder().encode(source.resources),
    ByteOffset.of(0),
  );
  assert(parsed.ok);
  assert(parsed.value.type === "dictionary");

  return {
    resources: PdfResources.from(parsed.value),
    resolveRef: (ref) => store.value.get(ref),
  };
}
