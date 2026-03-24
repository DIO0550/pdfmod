import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePdfDocument } from "./usePdfDocument.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("sourceがnullのとき初期状態を返す", () => {
  const { result } = renderHook(() => usePdfDocument(null));
  expect(result.current).toEqual({
    loading: false,
    error: null,
    data: null,
  });
});

test("sourceがUint8Arrayのときそのまま返す", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const { result } = renderHook(() => usePdfDocument(bytes));
  expect(result.current).toEqual({
    loading: false,
    error: null,
    data: bytes,
  });
});

test("sourceがURLのときfetch開始直後はloading=trueになる", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const { result } = renderHook(() =>
    usePdfDocument("https://example.com/doc.pdf"),
  );
  expect(result.current.loading).toBe(true);
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeNull();
});

test("sourceがURLでfetch成功するとdataにUint8Arrayがセットされる", async () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
      }),
    ),
  );

  const { result } = renderHook(() =>
    usePdfDocument("https://example.com/doc.pdf"),
  );

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.data).toBeInstanceOf(Uint8Array);
  expect(result.current.error).toBeNull();
});

test("sourceがURLでres.ok=falseのときerrorにstatus付きメッセージが入る", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 404 })),
  );

  const { result } = renderHook(() =>
    usePdfDocument("https://example.com/doc.pdf"),
  );

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.error?.message).toBe("Failed to fetch PDF: 404");
  expect(result.current.data).toBeNull();
});

test("sourceがURLでfetchがErrorでrejectされるとerrorにそのまま入る", async () => {
  const fetchError = new Error("Network failure");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(fetchError)),
  );

  const { result } = renderHook(() =>
    usePdfDocument("https://example.com/doc.pdf"),
  );

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.error).toBe(fetchError);
  expect(result.current.data).toBeNull();
});

test("sourceがURLでfetchが文字列でrejectされるとErrorに正規化される", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject("string error")),
  );

  const { result } = renderHook(() =>
    usePdfDocument("https://example.com/doc.pdf"),
  );

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.error?.message).toBe("string error");
  expect(result.current.data).toBeNull();
});

// cancelled ガードが .then(buffer) 経路を遮断することを検証。
// arrayBuffer() も遅延 Promise にして、チェーン終端まで到達してから確認する。
test("source変更時は前のfetch成功結果が無視される", async () => {
  let firstResolve: (value: unknown) => void = () => {};
  let firstArrayBufferResolve: (value: unknown) => void = () => {};
  const secondBytes = new Uint8Array([0x01, 0x02]);

  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          firstResolve = resolve;
        }),
    )
    .mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(secondBytes.buffer),
      }),
    );
  vi.stubGlobal("fetch", fetchMock);

  const { result, rerender } = renderHook(
    ({ source }: { source: string }) => usePdfDocument(source),
    { initialProps: { source: "https://example.com/first.pdf" } },
  );

  rerender({ source: "https://example.com/second.pdf" });

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.data).toBeInstanceOf(Uint8Array);

  firstResolve({
    ok: true,
    arrayBuffer: () =>
      new Promise((resolve) => {
        firstArrayBufferResolve = resolve;
      }),
  });
  await waitFor(() => {
    expect(firstArrayBufferResolve).not.toBe(() => {});
  });

  firstArrayBufferResolve(new Uint8Array([0xff, 0xff]).buffer);
  await waitFor(() => Promise.resolve());

  expect(result.current.data).toEqual(secondBytes);
});

// cancelled ガードが .catch 経路を遮断することを検証。
// reject と ok:false の両方で stale な error が state を上書きしないことを確認する。
test.each([
  {
    label: "reject",
    settle: (_resolve: (v: unknown) => void, reject: (r: unknown) => void) =>
      reject(new Error("stale network error")),
  },
  {
    label: "ok:false",
    settle: (resolve: (v: unknown) => void) =>
      resolve({ ok: false, status: 404 }),
  },
])("source変更時は前のfetchの$labelも無視される", async ({ settle }) => {
  let firstResolve: (value: unknown) => void = () => {};
  let firstReject: (reason: unknown) => void = () => {};
  const secondBytes = new Uint8Array([0x03, 0x04]);

  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          firstResolve = resolve;
          firstReject = reject;
        }),
    )
    .mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(secondBytes.buffer),
      }),
    );
  vi.stubGlobal("fetch", fetchMock);

  const { result, rerender } = renderHook(
    ({ source }: { source: string }) => usePdfDocument(source),
    { initialProps: { source: "https://example.com/first.pdf" } },
  );

  rerender({ source: "https://example.com/second.pdf" });

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.data).toEqual(secondBytes);

  settle(firstResolve, firstReject);
  await waitFor(() => Promise.resolve());

  expect(result.current.data).toEqual(secondBytes);
  expect(result.current.error).toBeNull();
});
