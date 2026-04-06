import { expect } from "vitest";
import type { PdfError } from "../../errors/index";
import type { Result } from "../../result/index";
import { ok } from "../../result/index";
import { GenerationNumber } from "../../types/generation-number/index";
import { ObjectNumber } from "../../types/object-number/index";
import type {
  IndirectRef,
  PdfObject,
  XRefEntry,
  XRefTable,
} from "../../types/pdf-types/index";
import type { LRUCache } from "../lru-cache/index";
import type {
  ObjectStreamBodyDeps,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "../object-stream-extractor/index";
import type { ObjectResolverDeps, ObjectStreamExtractDeps } from "./types";

/**
 * Result が ok であることをアサートし value を返す。
 *
 * @param result - unwrap 対象の Result
 * @returns ok の場合の value
 */
export const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { value: T }).value;
};

/**
 * Result が err であることをアサートし error を返す。
 *
 * @param result - unwrap 対象の Result
 * @returns err の場合の error
 */
export const unwrapErr = <E>(result: Result<unknown, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { error: E }).error;
};

export const makeRef = (objNum: number, genNum: number = 0): IndirectRef => ({
  objectNumber: ObjectNumber.of(objNum),
  generationNumber: GenerationNumber.of(genNum),
});

export const makeXRefTable = (
  entries: ReadonlyArray<readonly [number, XRefEntry]>,
): XRefTable => {
  const map = new Map<ObjectNumber, XRefEntry>();
  for (const [num, entry] of entries) {
    map.set(ObjectNumber.of(num), entry);
  }
  const maxNum = entries.length > 0 ? Math.max(...entries.map(([n]) => n)) : 0;
  return { entries: map, size: maxNum + 1 };
};

export const makeDeps = (
  overrides: Partial<ObjectResolverDeps> = {},
): ObjectResolverDeps => ({
  xref: overrides.xref ?? makeXRefTable([]),
  data: overrides.data ?? new Uint8Array(0),
});

export const makeStreamExtractDeps = (overrides: {
  resolver?: StreamResolver;
  parser?: StreamObjectParser;
  decompressor?: StreamDecompressor;
}): ObjectStreamExtractDeps => ({
  streamBodyDeps: {
    resolver: overrides.resolver ?? {
      resolve: () =>
        Promise.resolve(ok({ type: "null" }) as Result<PdfObject, PdfError>),
    },
    parser: overrides.parser ?? {
      parse: () => ok({ type: "null" } as PdfObject),
    },
    decompressor: overrides.decompressor ?? {
      decompress: (data: Uint8Array) => Promise.resolve(ok(data)),
    },
  },
});

export const stubExtract = (
  result: Result<PdfObject, PdfError>,
): {
  extract: (
    deps: ObjectStreamBodyDeps,
    cache: LRUCache<ObjectNumber, Uint8Array> | undefined,
    targetObjNum: ObjectNumber,
    streamObjNum: ObjectNumber,
    indexInStream: number,
  ) => Promise<Result<PdfObject, PdfError>>;
  calls: Array<{
    deps: ObjectStreamBodyDeps;
    targetObjNum: ObjectNumber;
    streamObjNum: ObjectNumber;
    indexInStream: number;
  }>;
} => {
  const calls: Array<{
    deps: ObjectStreamBodyDeps;
    targetObjNum: ObjectNumber;
    streamObjNum: ObjectNumber;
    indexInStream: number;
  }> = [];
  return {
    extract: (
      deps: ObjectStreamBodyDeps,
      _cache: LRUCache<ObjectNumber, Uint8Array> | undefined,
      targetObjNum: ObjectNumber,
      streamObjNum: ObjectNumber,
      indexInStream: number,
    ) => {
      calls.push({ deps, targetObjNum, streamObjNum, indexInStream });
      return Promise.resolve(result);
    },
    calls,
  };
};
