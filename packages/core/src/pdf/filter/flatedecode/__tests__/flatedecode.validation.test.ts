import { afterEach, assert, expect, test, vi } from "vitest";
import { decompressFlate } from "../index";

test("不正な圧縮データに対してFLATEDECODE_FAILEDエラーを返す", async () => {
  const invalid = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
  const result = await decompressFlate(invalid);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("空のUint8Array（長さ0）を入力した場合にFLATEDECODE_FAILEDエラーを返す", async () => {
  const empty = new Uint8Array(0);
  const result = await decompressFlate(empty);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("展開サイズがmaxDecompressedSizeを超過した場合にFLATEDECODE_FAILEDエラーを返す", async () => {
  // "Hello, PDF!" (11 bytes) に展開されるzlib圧縮データ
  const compressed = new Uint8Array([
    120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171,
    3, 60,
  ]);
  const result = await decompressFlate(compressed, 5);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toContain("exceeds limit");
});

// --- Issue #500: maxDecompressedSize 不正引数バリデーションテスト ---
const dummyData = new Uint8Array([
  120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171, 3,
  60,
]);

test.each([
  ["NaN", NaN],
  ["Infinity", Infinity],
  ["-Infinity", -Infinity],
  ["0", 0],
  ["負の数 (-1)", -1],
  ["非整数 (1.5)", 1.5],
  [
    "MAX_SAFE_INTEGER超過 (Number.MAX_SAFE_INTEGER + 1)",
    Number.MAX_SAFE_INTEGER + 1,
  ],
])("maxDecompressedSize に不正な値 (%s) を渡した場合にFLATEDECODE_FAILEDエラーを返す", async (_, invalidSize) => {
  const result = await decompressFlate(dummyData, invalidSize);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toBe(
    "Invalid maxDecompressedSize: must be a finite, positive safe integer",
  );
});

// --- Issue #500: Stream Writer エラーハンドリングテスト ---
afterEach(() => {
  vi.unstubAllGlobals();
});

interface MockDecompressionStreamInstance {
  mockWriter: {
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
  };
  mockReader: {
    read: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  writable: { getWriter: () => MockDecompressionStreamInstance["mockWriter"] };
  readable: { getReader: () => MockDecompressionStreamInstance["mockReader"] };
}

type MockDecompressionStreamClass =
  (new () => MockDecompressionStreamInstance) & {
    lastMockReader: MockDecompressionStreamInstance["mockReader"] | null;
  };

function createMockDecompressionStream(options: {
  writeError?: Error;
  closeError?: Error;
}): MockDecompressionStreamClass {
  let lastMockReader: MockDecompressionStreamInstance["mockReader"] | null =
    null;

  const MockClass = class MockDecompressionStream
    implements MockDecompressionStreamInstance
  {
    mockWriter = {
      write: options.writeError
        ? vi.fn().mockRejectedValue(options.writeError)
        : vi.fn().mockResolvedValue(undefined),
      close: options.closeError
        ? vi.fn().mockRejectedValue(options.closeError)
        : vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    };

    mockReader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };

    writable = { getWriter: () => this.mockWriter };
    readable = { getReader: () => this.mockReader };

    constructor() {
      lastMockReader = this.mockReader;
    }
  };

  return Object.defineProperty(MockClass, "lastMockReader", {
    get: () => lastMockReader,
    configurable: true,
  }) as MockDecompressionStreamClass;
}

test("writer.write() がエラーを起こした場合に FLATEDECODE_FAILED エラーを返し reader.cancel が呼ばれる", async () => {
  const MockDS = createMockDecompressionStream({
    writeError: new Error("Simulated write error"),
  });
  vi.stubGlobal("DecompressionStream", MockDS);

  const result = await decompressFlate(dummyData);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toBe(
    "FlateDecode decompression failed during write",
  );
  expect(MockDS.lastMockReader?.cancel).toHaveBeenCalled();
});

test("writer.close() がエラーを起こした場合に FLATEDECODE_FAILED エラーを返し reader.cancel が呼ばれる", async () => {
  const MockDS = createMockDecompressionStream({
    closeError: new Error("Simulated close error"),
  });
  vi.stubGlobal("DecompressionStream", MockDS);

  const result = await decompressFlate(dummyData);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toBe(
    "FlateDecode decompression failed during write",
  );
  expect(MockDS.lastMockReader?.cancel).toHaveBeenCalled();
});
