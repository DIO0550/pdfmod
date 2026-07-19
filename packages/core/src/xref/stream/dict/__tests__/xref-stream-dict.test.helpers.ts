import type { PdfValue } from "../../../../pdf/types/pdf-types/index";

/**
 * 妥当な xref ストリーム辞書を組み立てる。`overrides` で個別エントリを差し替え・削除できる。
 *
 * @param overrides - 上書きするエントリ（値 `undefined` を渡すとキー自体削除する）
 * @returns テスト用の xref ストリーム辞書エントリマップ
 */
export function makeXRefStreamDict(
  overrides: Record<string, PdfValue | undefined> = {},
): Map<string, PdfValue> {
  const base = new Map<string, PdfValue>([
    ["Type", { type: "name", value: "XRef" }],
    [
      "W",
      {
        type: "array",
        elements: [
          { type: "integer", value: 1 },
          { type: "integer", value: 2 },
          { type: "integer", value: 1 },
        ],
      },
    ],
    ["Size", { type: "integer", value: 8 }],
    [
      "Index",
      {
        type: "array",
        elements: [
          { type: "integer", value: 0 },
          { type: "integer", value: 8 },
        ],
      },
    ],
    ["Filter", { type: "name", value: "FlateDecode" }],
    ["Root", { type: "indirect-ref", objectNumber: 1, generationNumber: 0 }],
  ]);

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      base.delete(key);
    } else {
      base.set(key, value);
    }
  }

  return base;
}
