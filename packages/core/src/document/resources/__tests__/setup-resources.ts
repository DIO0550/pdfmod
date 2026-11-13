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
  readonly objects?: readonly (string | Uint8Array)[];
}): { readonly resources: PdfResources; readonly resolveRef: ResolveRef } {
  const encoder = new TextEncoder();
  const objects = (source.objects ?? []).map((body, index) => {
    const header = encoder.encode(`${index + 1} 0 obj\n`);
    const content = typeof body === "string" ? encoder.encode(body) : body;
    const footer = encoder.encode("\nendobj\n");
    const bytes = new Uint8Array(
      header.length + content.length + footer.length,
    );
    bytes.set(header);
    bytes.set(content, header.length);
    bytes.set(footer, header.length + content.length);
    return bytes;
  });
  const length = objects.reduce((sum, bytes) => sum + bytes.byteLength, 0);
  const data = new Uint8Array(length);
  const entries = new Map<ObjectNumber, XRefEntry>();

  let offset = 0;
  for (const [index, bytes] of objects.entries()) {
    entries.set(ObjectNumber.of(index + 1), {
      type: 1,
      offset: ByteOffset.of(offset),
      generationNumber: GenerationNumber.of(0),
    });
    data.set(bytes, offset);
    offset += bytes.byteLength;
  }

  const store = ObjectStore.create({
    data,
    xref: { entries, size: objects.length + 1 },
  });
  assert(store.ok);

  const parsed = ObjectParser.parse(
    encoder.encode(source.resources),
    ByteOffset.of(0),
  );
  assert(parsed.ok);
  assert(parsed.value.type === "dictionary");

  return {
    resources: PdfResources.from(parsed.value),
    resolveRef: (ref) => store.value.get(ref),
  };
}
