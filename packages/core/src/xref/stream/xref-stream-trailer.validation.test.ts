import { expect, test } from "vitest";
import type { PdfObject } from "../../types/index";
import { buildXRefStreamTrailerDict } from "./xref-stream-trailer";

const validRoot: PdfObject = {
  type: "indirect-ref",
  objectNumber: 1,
  generationNumber: 0,
};
const validSize: PdfObject = { type: "integer", value: 10 };

test("/Rootが欠落している場合にROOT_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([["Size", validSize]]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/RootがIndirectRefでない場合にROOT_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", { type: "integer", value: 1 }],
    ["Size", validSize],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/RootのobjectNumberが負数の場合にROOT_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", { type: "indirect-ref", objectNumber: -1, generationNumber: 0 }],
    ["Size", validSize],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/RootのobjectNumberがNumber.MAX_SAFE_INTEGERを超える場合にROOT_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    [
      "Root",
      {
        type: "indirect-ref",
        objectNumber: Number.MAX_SAFE_INTEGER + 1,
        generationNumber: 0,
      },
    ],
    ["Size", validSize],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/RootのgenerationNumberが65535超の場合にROOT_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    [
      "Root",
      { type: "indirect-ref", objectNumber: 1, generationNumber: 65536 },
    ],
    ["Size", validSize],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/Sizeが欠落している場合にSIZE_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([["Root", validRoot]]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("SIZE_NOT_FOUND");
});

test("/Sizeが負数の場合にSIZE_NOT_FOUNDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", { type: "integer", value: -1 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("SIZE_NOT_FOUND");
});

test("/Prevが非整数の場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    ["Prev", { type: "real", value: 1.5 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/Prevが負数の場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    ["Prev", { type: "integer", value: -1 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/PrevがNumber.MAX_SAFE_INTEGERを超える場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    ["Prev", { type: "integer", value: Number.MAX_SAFE_INTEGER + 1 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/InfoがIndirectRefでない場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    ["Info", { type: "integer", value: 1 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/InfoのobjectNumberがNumber.MAX_SAFE_INTEGERを超える場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    [
      "Info",
      {
        type: "indirect-ref",
        objectNumber: Number.MAX_SAFE_INTEGER + 1,
        generationNumber: 0,
      },
    ],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/InfoのgenerationNumberが65535超の場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    [
      "Info",
      { type: "indirect-ref", objectNumber: 2, generationNumber: 65536 },
    ],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/IDが2要素配列でない場合にXREF_STREAM_INVALIDエラーを返す", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    [
      "ID",
      {
        type: "array",
        elements: [
          {
            type: "string",
            value: new Uint8Array([0x01]),
            encoding: "hex" as const,
          },
        ],
      },
    ],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("XREF_STREAM_INVALID");
});
