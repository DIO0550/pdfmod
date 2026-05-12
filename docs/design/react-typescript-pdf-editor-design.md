# React + TypeScript 向け PDFエディタ設計ガイド

## 目的

このドキュメントは、**React + TypeScript で PDF エディタを作るときに破綻しにくい設計**を、実際のコード込みでまとめたものです。

対象にしている要件は次のようなものです。

- PDF を読み込む
- テキストや画像を追加する
- ページ削除や保存を行う
- 最後にダウンロードする
- React の UI と組み合わせる

---

## 先に結論

おすすめ構成はこれです。

- **React**: UI と画面状態
- **PdfEditor class**: PDF 編集の中核
- **type**: 入出力や状態の定義
- **純粋関数**: 検証、座標変換、ダウンロードなど
- **command 関数**: 編集処理の分離
- **adapter 層**: `pdf-lib` など外部ライブラリ依存を隔離

つまり、設計の軸は次です。

```text
React(UI)
  ↓
usePdfEditor(hook)
  ↓
PdfEditor(class)
  ↓
commands / utils
  ↓
pdf-lib
```

---

# なぜこの形がいいのか

PDF 編集は、普通のフォームアプリより状態が重いです。

- PDF の本体が重い
- ページ数を持つ
- フォントや画像を埋め込む
- 複数回編集して最後に保存する
- React の再レンダリングとは別に、編集エンジンの状態を維持したい

そのため、**React state に全部入れる設計**は崩れやすいです。

特に避けたいのはこれです。

```tsx
const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
```

これは見た目は簡単ですが、責務が混ざりやすいです。

---

# おすすめディレクトリ構成

まずはこのくらいがかなり良い落としどころです。

```text
src/
  components/
    PdfEditorPage.tsx
    Toolbar.tsx
    FileUploader.tsx
    PageNavigator.tsx

  hooks/
    usePdfEditor.ts

  pdf/
    core/
      PdfEditor.ts
      PdfTypes.ts

    commands/
      addTextToPage.ts
      removePageFromDoc.ts

    utils/
      validation.ts
      coordinate.ts
      download.ts
      blob.ts

  lib/
    pdfLib.ts
```

最初はここまで細かくなくても大丈夫です。  
小さく始めるなら次でも十分です。

```text
src/
  pdf/
    PdfEditor.ts
    PdfTypes.ts
    commands.ts
    utils.ts
    download.ts

  hooks/
    usePdfEditor.ts

  components/
    PdfEditorPage.tsx
```

---

# 役割分担

## React の責務

React は UI に集中させます。

React が持つもの:

- 現在ページ
- ズーム
- 選択中ツール
- 入力フォームの値
- ローディング状態
- エラー表示
- モーダル開閉

React が持たない方がいいもの:

- PDFDocument 本体
- 埋め込み済みフォントの実体
- 重いバイナリ
- PDF 編集ロジック本体

---

## PdfEditor class の責務

`PdfEditor` は「PDF をどう編集するか」だけを担当します。

- load
- getPageCount
- addText
- addImage
- removePage
- save

このクラスには、React の state 操作や DOM 操作は入れません。

---

## type の責務

`type` はデータの形を定義します。

- 入力パラメータ
- 表示状態
- コマンド引数
- API 入出力

クラスを使っていても、**データ形状は type で持つ**のがきれいです。

---

## 純粋関数の責務

純粋関数が向いているのは次です。

- ページ番号の検証
- 座標変換
- Blob 変換
- ダウンロード
- 入力正規化
- command の小さなロジック

---

# 実装例

以下は、そのままベースにできるコードです。

---

## 1. 型定義: `src/pdf/core/PdfTypes.ts`

```ts
export type AddTextInput = {
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  fontSize?: number;
};

export type AddImageInput = {
  pageIndex: number;
  imageBytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewerState = {
  currentPage: number;
  zoom: number;
};

export type EditorStatus = "idle" | "loading" | "ready" | "saving" | "error";
```

---

## 2. バリデーション: `src/pdf/utils/validation.ts`

```ts
export function assertPageIndex(pageIndex: number, pageCount: number): void {
  if (!Number.isInteger(pageIndex)) {
    throw new Error("pageIndex must be an integer");
  }

  if (pageIndex < 0 || pageIndex >= pageCount) {
    throw new Error(`Invalid page index: ${pageIndex}`);
  }
}

export function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
}

export function assertNonEmptyString(value: string, fieldName: string): void {
  if (!value.trim()) {
    throw new Error(`${fieldName} must not be empty`);
  }
}
```

---

## 3. 座標変換: `src/pdf/utils/coordinate.ts`

PDF の座標系は左下原点なので、UI 座標とズレることがあります。

```ts
export function toPdfY(viewY: number, pageHeight: number): number {
  return pageHeight - viewY;
}
```

---

## 4. ダウンロード処理: `src/pdf/utils/download.ts`

ブラウザ依存の処理はクラスから分けておくと再利用しやすいです。

```ts
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}
```

---

## 5. コマンド: `src/pdf/commands/addTextToPage.ts`

編集処理をコマンド関数として分けると、`PdfEditor` が太りすぎません。

```ts
import type { PDFDocument } from "pdf-lib";
import type { AddTextInput } from "../core/PdfTypes";
import { assertNonEmptyString, assertPageIndex } from "../utils/validation";

export function addTextToPage(doc: PDFDocument, input: AddTextInput): void {
  assertPageIndex(input.pageIndex, doc.getPageCount());
  assertNonEmptyString(input.text, "text");

  const page = doc.getPage(input.pageIndex);
  page.drawText(input.text, {
    x: input.x,
    y: input.y,
    size: input.fontSize ?? 16,
  });
}
```

---

## 6. コマンド: `src/pdf/commands/removePageFromDoc.ts`

```ts
import type { PDFDocument } from "pdf-lib";
import { assertPageIndex } from "../utils/validation";

export function removePageFromDoc(doc: PDFDocument, pageIndex: number): void {
  assertPageIndex(pageIndex, doc.getPageCount());
  doc.removePage(pageIndex);
}
```

---

## 7. 中核クラス: `src/pdf/core/PdfEditor.ts`

ここが編集エンジンです。

```ts
import { PDFDocument } from "pdf-lib";
import type { AddImageInput, AddTextInput } from "./PdfTypes";
import { addTextToPage } from "../commands/addTextToPage";
import { removePageFromDoc } from "../commands/removePageFromDoc";
import { assertPageIndex } from "../utils/validation";

export class PdfEditor {
  private doc: PDFDocument | null = null;
  private fileName = "edited.pdf";

  async load(source: ArrayBuffer, fileName?: string): Promise<void> {
    this.doc = await PDFDocument.load(source);

    if (fileName) {
      this.fileName = fileName;
    }
  }

  isLoaded(): boolean {
    return this.doc !== null;
  }

  getFileName(): string {
    return this.fileName;
  }

  getPageCount(): number {
    this.assertLoaded();
    return this.doc.getPageCount();
  }

  addText(input: AddTextInput): void {
    this.assertLoaded();
    addTextToPage(this.doc, input);
  }

  async addImage(input: AddImageInput): Promise<void> {
    this.assertLoaded();
    assertPageIndex(input.pageIndex, this.doc.getPageCount());

    const page = this.doc.getPage(input.pageIndex);

    const image =
      input.mimeType === "image/png"
        ? await this.doc.embedPng(input.imageBytes)
        : await this.doc.embedJpg(input.imageBytes);

    page.drawImage(image, {
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    });
  }

  removePage(pageIndex: number): void {
    this.assertLoaded();
    removePageFromDoc(this.doc, pageIndex);
  }

  async save(): Promise<Uint8Array> {
    this.assertLoaded();
    return await this.doc.save();
  }

  private assertLoaded(): asserts this is { doc: PDFDocument } {
    if (!this.doc) {
      throw new Error("PDF is not loaded");
    }
  }
}
```

---

## 8. React 連携 hook: `src/hooks/usePdfEditor.ts`

`PdfEditor` インスタンスは `useRef` で持つのが自然です。

```ts
import { useRef, useState } from "react";
import { PdfEditor } from "../pdf/core/PdfEditor";
import type { AddTextInput, AddImageInput, EditorStatus } from "../pdf/core/PdfTypes";
import { downloadPdf } from "../pdf/utils/download";

export function usePdfEditor() {
  const editorRef = useRef<PdfEditor | null>(null);

  const [status, setStatus] = useState<EditorStatus>("idle");
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (file: File) => {
    setStatus("loading");
    setError(null);

    try {
      const bytes = await file.arrayBuffer();

      const editor = new PdfEditor();
      await editor.load(bytes, file.name);

      editorRef.current = editor;
      setPageCount(editor.getPageCount());
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load PDF");
    }
  };

  const addText = (input: AddTextInput) => {
    if (!editorRef.current) {
      throw new Error("Editor is not initialized");
    }

    editorRef.current.addText(input);
  };

  const addImage = async (input: AddImageInput) => {
    if (!editorRef.current) {
      throw new Error("Editor is not initialized");
    }

    await editorRef.current.addImage(input);
  };

  const removePage = (pageIndex: number) => {
    if (!editorRef.current) {
      throw new Error("Editor is not initialized");
    }

    editorRef.current.removePage(pageIndex);
    setPageCount(editorRef.current.getPageCount());
  };

  const save = async (): Promise<Uint8Array> => {
    if (!editorRef.current) {
      throw new Error("Editor is not initialized");
    }

    setStatus("saving");
    setError(null);

    try {
      const bytes = await editorRef.current.save();
      setStatus("ready");
      return bytes;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save PDF");
      throw err;
    }
  };

  const download = async () => {
    const bytes = await save();
    const fileName = editorRef.current?.getFileName() ?? "edited.pdf";
    downloadPdf(bytes, fileName);
  };

  return {
    status,
    pageCount,
    error,
    loadFile,
    addText,
    addImage,
    removePage,
    save,
    download,
    editorRef,
  };
}
```

---

## 9. React コンポーネント例: `src/components/PdfEditorPage.tsx`

実際の画面側では UI だけを書くようにします。

```tsx
import { useState } from "react";
import { usePdfEditor } from "../hooks/usePdfEditor";

export function PdfEditorPage() {
  const { status, pageCount, error, loadFile, addText, removePage, download } = usePdfEditor();

  const [text, setText] = useState("Hello PDF");

  const isReady = status === "ready";

  return (
    <div style={{ padding: 16 }}>
      <h1>PDF Editor</h1>

      <input
        type="file"
        accept="application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void loadFile(file);
          }
        }}
      />

      <div style={{ marginTop: 12 }}>
        <button
          onClick={() =>
            addText({
              pageIndex: 0,
              text,
              x: 100,
              y: 300,
              fontSize: 18,
            })
          }
          disabled={!isReady}
        >
          文字追加
        </button>

        <button onClick={() => removePage(0)} disabled={!isReady || pageCount <= 1}>
          1ページ目削除
        </button>

        <button onClick={() => void download()} disabled={!isReady}>
          保存してダウンロード
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status}
      </div>

      <div>
        <strong>Pages:</strong> {pageCount}
      </div>

      {error && (
        <div style={{ color: "red", marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
```

---

# この設計のポイント

## 1. クラスは UI を知らない

`PdfEditor` は React の存在を知りません。  
これが大事です。

悪い例:

```ts
class PdfEditor {
  setZoom(value: number) {}
  openModal() {}
  showToast() {}
}
```

これをやると、ドメインロジックと UI ロジックが混ざります。

---

## 2. React は PDF の内部構造を知らない

React 側は `addText()` や `removePage()` を呼ぶだけです。  
内部で `pdf-lib` をどう使うかは知りません。

これにより:

- UI 差し替えしやすい
- テストしやすい
- 外部ライブラリ変更にも耐えやすい

---

## 3. type はクラスの代わりではなく、補完役

`type` はすごく重要ですが、PDF 本体を全部プレーンオブジェクトで表す必要はありません。

良い分担:

- **状態を持つ本体** → class
- **データの形** → type

---

## 4. command 分離で肥大化を防ぐ

最初は `PdfEditor` に全部書いても動きます。  
でも機能が増えると、すぐ大きくなります。

そのため、次のように逃がします。

- `addTextToPage`
- `addImageToPage`
- `removePageFromDoc`
- `mergePdfDocs`
- `insertBlankPage`

`PdfEditor` はオーケストレーターになります。

---

# 今後増やしやすい機能

この設計なら、次の機能を無理なく追加できます。

- テキスト色変更
- フォント埋め込み
- 画像挿入
- ページ並び替え
- PDF 結合
- PDF 分割
- 透かし追加
- アノテーション追加
- undo/redo 用の command 履歴

---

# undo/redo を入れたくなったら

将来的に undo/redo が必要なら、次の方向に伸ばせます。

```ts
type EditorCommand =
  | { type: "addText"; payload: AddTextInput }
  | { type: "removePage"; payload: { pageIndex: number } };
```

ただし、最初から入れなくていいです。  
まずは `PdfEditor` + `commands` の構成で十分です。

---

# やってはいけない設計まとめ

## 1. PDFDocument を React state に入れる

```tsx
const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
```

避けた方がいいです。

---

## 2. コンポーネントから直接 `pdf-lib` を触る

```tsx
const handleClick = async () => {
  const doc = await PDFDocument.load(bytes);
  doc.getPage(0).drawText("Hello");
};
```

ロジックが散らばります。

---

## 3. 何でもクラスに詰め込む

- ファイルダイアログ
- トースト表示
- モーダル操作
- React state 更新

これはクラスに入れない方がいいです。

---

## 4. すべてを pure function にしようとする

```ts
type PdfState = { ... };

function addText(pdf: PdfState, input: AddTextInput): PdfState
```

理論上は可能でも、外部ライブラリの実態とズレやすいです。  
React 向けの現実解としては、そこまで純化しなくて大丈夫です。

---

# 最小構成で始めるなら

最小でも十分良い構成はこれです。

```text
src/
  pdf/
    PdfEditor.ts
    PdfTypes.ts
    commands.ts
    validation.ts
    download.ts

  hooks/
    usePdfEditor.ts

  components/
    PdfEditorPage.tsx
```

最初はここから始めて、機能追加で分割していけば十分です。

---

# 最終結論

React + TypeScript で PDF エディタを作るなら、かなり良い設計は次です。

- **PDF 本体は class で持つ**
- **データ形状は type で定義する**
- **周辺処理は pure function に分離する**
- **React は UI に専念する**
- **インスタンスは useRef で保持する**
- **外部ライブラリ依存は PdfEditor の内側に閉じ込める**

一言でいうとこれです。

```text
class + type + pure functions + React UI
```

この構成が、シンプルさと拡張性のバランスがかなり良いです。
