import { useEffect, useState } from "react";

export interface PdfDocumentState {
  loading: boolean;
  error: Error | null;
  data: Uint8Array | null;
}

/**
 * Hook to load a PDF document from a URL or Uint8Array.
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
