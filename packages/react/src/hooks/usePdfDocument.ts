import { useEffect, useState } from "react";

/**
 * PDFドキュメントの読み込み状態を表すインターフェース。
 *
 * @example
 * ```ts
 * const state: PdfDocumentState = {
 *   loading: false,
 *   error: null,
 *   data: new Uint8Array([...]),
 * };
 * ```
 */
export interface PdfDocumentState {
  /** 読み込み中かどうか */
  loading: boolean;
  /** 読み込みエラー（エラーがない場合はnull） */
  error: Error | null;
  /** 読み込んだPDFバイナリデータ（未読み込みの場合はnull） */
  data: Uint8Array | null;
}

/**
 * URLまたはUint8ArrayからPDFドキュメントを読み込むフック。
 * sourceがURL文字列の場合はfetchで非同期取得し、Uint8Arrayの場合はそのまま使用する。
 * sourceがnullの場合は初期状態にリセットする。
 *
 * @param source - PDFソース（URL文字列、Uint8Arrayバイナリ、またはnull）
 * @returns 読み込み状態オブジェクト（{@link PdfDocumentState}）。
 *   `loading` はsourceがURL文字列のときfetch中のみ `true` になり、それ以外のときは `false`。
 *   `error` はfetch失敗時にErrorオブジェクトとなり、エラーがない場合（sourceがnullまたはUint8Arrayの場合や正常終了時）は `null`。
 *   `data` は読み込みに成功した場合にPDFバイナリの `Uint8Array` となり、
 *   初期状態、sourceがnullのとき、fetch中、またはエラー発生時には `null`（`Uint8Array | null`）となる。
 *
 * @example
 * ```tsx
 * const { loading, error, data } = usePdfDocument("https://example.com/doc.pdf");
 * if (loading) return <p>Loading...</p>;
 * if (error) return <p>Error: {error.message}</p>;
 * ```
 */
export function usePdfDocument(
  source: string | Uint8Array | null,
): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({
    loading: false,
    error: null,
    data: null,
  });

  useEffect(() => {
    if (!source) {
      setState({ loading: false, error: null, data: null });
      return;
    }

    if (typeof source !== "string") {
      setState({ loading: false, error: null, data: source });
      return;
    }

    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetch(source)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch PDF: ${res.status}`);
        }
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            data: new Uint8Array(buffer),
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            data: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return state;
}
