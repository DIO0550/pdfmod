# PDF解析パイプライン - xref解析仕様

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## 概要

PDFファイル末尾からstartxrefを検出し、xrefテーブル（テキスト形式・ストリーム形式）とトレイラ辞書を解析する。`/Prev`チェーンを再帰的に辿り、インクリメンタルアップデートされた複数のxrefを1つのマージ済みテーブルに統合する。

## モジュール構成

| モジュール | 責務 |
|:-----------|:-----|
| `StartXRefScanner` | ファイル末尾からstartxrefオフセットを検出 |
| `XRefTableParser` | テキスト形式xrefテーブルを解析 |
| `XRefStreamParser` | ストリーム形式xref（PDF 1.5+）を解析 |
| `TrailerParser` | トレイラ辞書を解析し`TrailerDict`を構築 |
| `XRefMerger` | `/Prev`チェーンを辿り複数xrefをマージ |

## データ型

### XRefEntry

```typescript
interface XRefEntry {
  /** エントリタイプ: 0=空き, 1=通常オブジェクト, 2=オブジェクトストリーム内 */
  type: 0 | 1 | 2;
  /** type=1: ファイル内バイトオフセット, type=2: 親ストリームのオブジェクト番号 */
  field2: number;
  /** type=0,1: 世代番号, type=2: ストリーム内インデックス */
  field3: number;
}
```

### XRefTable

```typescript
interface XRefTable {
  /** オブジェクト番号 → XRefEntry のマップ */
  entries: Map<number, XRefEntry>;
  /** テーブル内の最大オブジェクト番号 + 1 */
  size: number;
}
```

### TrailerDict

```typescript
interface TrailerDict {
  /** /Root — ドキュメントカタログへの間接参照（必須） */
  root: IndirectRef;
  /** /Size — xrefテーブルのエントリ総数（必須） */
  size: number;
  /** /Prev — 前のxrefテーブルのバイトオフセット */
  prev?: number;
  /** /Info — ドキュメント情報辞書への間接参照 */
  info?: IndirectRef;
  /** /ID — ファイル識別子 [永続ID, 変更ID] */
  id?: [Uint8Array, Uint8Array];
}
```

## 処理仕様

### StartXRefScanner

**入力**: `Uint8Array`（PDFバイナリ全体）
**出力**: `number`（xrefテーブルのバイトオフセット）

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| XR-001 | %%EOF検出 | ファイル末尾1024バイトを逆方向スキャン | `%%EOF` 文字列を後方検索 |
| XR-002 | startxref検出 | %%EOF の上方向をスキャン | `startxref` キーワードの後の数値を取得 |
| XR-003 | %%EOF未検出 | 1024バイト以内に見つからない | スキャン範囲を拡大（最大4096バイト） |
| XR-004 | startxref未検出 | %%EOF付近に見つからない | `PdfParseError` をスロー（寛容モードではフォールバックスキャナへ） |

### XRefTableParser（テキスト形式）

**入力**: `Uint8Array` + オフセット
**出力**: `{ xref: XRefTable, trailerOffset: number }`

処理フロー:
1. 指定オフセットで `xref` キーワードを確認
2. サブセクションヘッダ `{firstObj} {count}` を読み取り
3. 各エントリ（固定長20バイト）をパース
4. 複数サブセクション対応（連続しないオブジェクト番号範囲）
5. `trailer` キーワードの位置を返却

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| XT-001 | エントリフォーマット | 20バイト固定長 | `nnnnnnnnnn ggggg n\r\n` をパース |
| XT-002 | 状態フラグ | `n` = 使用中, `f` = 空き | type=1 (n) / type=0 (f) に変換 |
| XT-003 | オブジェクト0 | 常に世代番号65535の空きオブジェクト | 空きリストのヘッドとして扱う |
| XT-004 | 複数サブセクション | 連続しないオブジェクト番号範囲 | 各サブセクションを順次パース |
| XT-005 | EOLバリエーション | CR+LF, LF, CR+SP | 全パターンを許容（寛容処理） |

### XRefStreamParser（ストリーム形式）

**入力**: `Uint8Array` + オフセット + ObjectParser
**出力**: `{ xref: XRefTable, trailer: TrailerDict }`

処理フロー:
1. 指定オフセットでストリームオブジェクトをパース
2. `/Type /XRef` を確認
3. `/W` 配列からフィールド幅を取得
4. ストリームデータを展開（FlateDecode）
5. バイナリデータを `/W` に基づいてXRefEntryに変換
6. ストリーム辞書からトレイラ情報を抽出

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| XS-001 | /W配列 | `[w1 w2 w3]` | 各エントリは `w1+w2+w3` バイトで構成 |
| XS-002 | /Index配列 | 存在する場合 | サブセクション範囲を指定 |
| XS-003 | /Index不在 | デフォルト | `[0 /Size]` として扱う |
| XS-004 | Typeフィールド幅0 | w1 = 0 | デフォルト値1（通常オブジェクト）として扱う |
| XS-005 | /Filter | FlateDecode | pakoで展開 |
| XS-006 | /Prev | 存在する場合 | 前のxrefへのオフセットとしてTrailerDictに格納 |

### TrailerParser

**入力**: `Uint8Array` + trailerオフセット + ObjectParser
**出力**: `TrailerDict`

処理フロー:
1. `trailer` キーワードの後の辞書をパース
2. 必須エントリ（`/Root`, `/Size`）の存在を検証
3. オプションエントリ（`/Prev`, `/Info`, `/ID`）を抽出

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| TR-001 | /Root必須 | 未検出 | `PdfParseError` をスロー |
| TR-002 | /Size必須 | 未検出 | `PdfParseError` をスロー |
| TR-003 | /Prev | 整数値 | 前のxrefテーブルのオフセットとして記録 |
| TR-004 | /ID | 2要素の配列 | Uint8Arrayのペアに変換 |

### XRefMerger

**入力**: `Uint8Array` + 最新のstartxrefオフセット
**出力**: `{ mergedXRef: XRefTable, trailer: TrailerDict }`

処理フロー:
1. 最新のxref/トレイラを解析
2. `/Prev` が存在する場合、そのオフセットで再帰的にxrefを解析
3. 全xrefを古いものから順にマージ（新しいエントリが優先）
4. 最新のトレイラ辞書を返却（`/Root`は最新のものを使用）

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| XM-001 | マージ順序 | 複数xref存在 | 新しいxrefのエントリが古いものを上書き |
| XM-002 | 循環防止 | /Prevが同一オフセットを指す | `XREF_PREV_CHAIN_CYCLE` エラーを返す |
| XM-003 | 深度制限 | /Prevチェーンが深すぎる | 最大100段で `XREF_PREV_CHAIN_TOO_DEEP` エラーを返す |
| XM-004 | 形式混在 | テキスト形式とストリーム形式の混在 | コールバック提供側が形式を判定し適切なパーサを呼び出す |

> 📄 詳細仕様は [xref-merger-spec.md](./xref-merger-spec.md) を参照。

## ファイル配置

```
packages/core/src/
├── xref/
│   ├── index.ts              # 再エクスポート
│   ├── startxref-scanner.ts  # StartXRefScanner
│   ├── xref-table-parser.ts  # XRefTableParser
│   ├── xref-stream-parser.ts # XRefStreamParser
│   ├── trailer-parser.ts     # TrailerParser
│   └── xref-merger.ts        # XRefMerger
└── types/
    └── index.ts              # XRefEntry, XRefTable, TrailerDict 追加
```

## 関連仕様

- [object-resolver-spec.md](./object-resolver-spec.md) - xrefテーブルを使ってオブジェクトを解決
- [error-handling-spec.md](./error-handling-spec.md) - フォールバックxrefスキャナの仕様
- `docs/specs/02_file_structure.md` - ISO 32000仕様の詳細
