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
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(fetchError)));

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
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject("string error")));

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

test("source変更時は前のfetch結果が無視される", async () => {
  let firstResolve: (value: unknown) => void;
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

  // 2つ目のURLに変更
  rerender({ source: "https://example.com/second.pdf" });

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.data).toBeInstanceOf(Uint8Array);

  // 1つ目のfetchが遅延して完了
  let firstArrayBufferResolve: (value: unknown) => void;
  firstResolve!({
    ok: true,
    arrayBuffer: () =>
      new Promise((resolve) => {
        firstArrayBufferResolve = resolve;
      }),
  });
  // 1つ目の .then(res => res.arrayBuffer()) が実行されるまで待つ
  await waitFor(() => {
    expect(firstArrayBufferResolve!).toBeDefined();
  });

  // arrayBuffer を解決 → .then(buffer => setState) が実行されるが cancelled なので無視される
  firstArrayBufferResolve!(new Uint8Array([0xff, 0xff]).buffer);
  // チェーン全体をflush
  await waitFor(() => Promise.resolve());

  // 2つ目の結果が維持されている（1つ目で上書きされていない）
  expect(result.current.data).toEqual(secondBytes);
});

test("source変更時は前のfetchのrejectも無視される", async () => {
  let firstReject: (reason: unknown) => void;
  const secondBytes = new Uint8Array([0x03, 0x04]);

  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
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

  // 2つ目のURLに変更
  rerender({ source: "https://example.com/second.pdf" });

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.data).toEqual(secondBytes);

  // 1つ目のfetchが遅延してreject → .catch 側の cancelled ガードで無視される
  firstReject!(new Error("stale network error"));
  await waitFor(() => Promise.resolve());

  // 2つ目の結果が維持され、errorはnullのまま
  expect(result.current.data).toEqual(secondBytes);
  expect(result.current.error).toBeNull();
});

test("source変更時は前のfetchのok:falseも無視される", async () => {
  let firstResolve: (value: unknown) => void;
  const secondBytes = new Uint8Array([0x05, 0x06]);

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

  // 2つ目のURLに変更
  rerender({ source: "https://example.com/second.pdf" });

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.data).toEqual(secondBytes);

  // 1つ目のfetchが遅延して ok:false で完了 → .then内でthrow → .catch の cancelled ガードで無視
  firstResolve!({ ok: false, status: 404 });
  await waitFor(() => Promise.resolve());

  // 2つ目の結果が維持され、errorはnullのまま
  expect(result.current.data).toEqual(secondBytes);
  expect(result.current.error).toBeNull();
});
