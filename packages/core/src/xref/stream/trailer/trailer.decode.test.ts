import { assert, expect, test } from "vitest";
import type { PdfValue } from "../../../types/index";
import { buildXRefStreamTrailerDict } from "./index";

test("/Rootと/Sizeのみの最小辞書からTrailerDictを構築する", () => {
  const dict = new Map<string, PdfValue>([
    ["Root", { type: "indirect-ref", objectNumber: 1, generationNumber: 0 }],
    ["Size", { type: "integer", value: 10 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  assert(result.ok);
  expect(result.value.root.objectNumber).toBe(1);
  expect(result.value.root.generationNumber).toBe(0);
  expect(result.value.size).toBe(10);
  expect(result.value.prev).toBeUndefined();
  expect(result.value.info).toBeUndefined();
  expect(result.value.id).toBeUndefined();
});

test("/Root, /Size, /Prev, /Info, /IDすべてを含む辞書からTrailerDictを構築する", () => {
  const dict = new Map<string, PdfValue>([
    ["Root", { type: "indirect-ref", objectNumber: 1, generationNumber: 0 }],
    ["Size", { type: "integer", value: 100 }],
    ["Prev", { type: "integer", value: 512 }],
    ["Info", { type: "indirect-ref", objectNumber: 2, generationNumber: 0 }],
    [
      "ID",
      {
        type: "array",
        elements: [
          {
            type: "string",
            value: new Uint8Array([0x01, 0x02]),
            encoding: "hex" as const,
          },
          {
            type: "string",
            value: new Uint8Array([0x03, 0x04]),
            encoding: "hex" as const,
          },
        ],
      },
    ],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  assert(result.ok);
  expect(result.value.root.objectNumber).toBe(1);
  expect(result.value.size).toBe(100);
  expect(result.value.prev).toBe(512);
  expect(result.value.info?.objectNumber).toBe(2);
  expect(result.value.id?.[0]).toEqual(new Uint8Array([0x01, 0x02]));
  expect(result.value.id?.[1]).toEqual(new Uint8Array([0x03, 0x04]));
});
