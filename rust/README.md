# pdfmod (Rust)

pdfmod の **Rust 実装**（`pdfmod-core`）。PDF 処理エンジンを `std` のみで実装するワークスペース。

ISO 32000-1:2008 (PDF 1.7) / ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

## 設計方針

- **外部 crate 依存ゼロ。** Rust 標準ライブラリ (`std`) のみを使う。zlib/inflate などの
  フィルタ処理も自前で実装する。Cargo はビルド／テスト管理ツールとしてのみ使用する。
- **`Result` / `Option` は std のものを使う。** 汎用の `Result` / `Option` クローンは作らない。
  一方で、ドメイン固有の状態を型で表す判別可能 enum（`XRefEntry` / `LexOutcome` など）は推奨する。
  「状態と有効フィールドの対応をコメントではなく型で保証する」ことを優先する。
  エラーに「実際に来た型」を載せる用途も、文字列ラベルではなくデータを持たない判別 enum
  （`ObjectKind` / `TokenKind`）で表す。網羅 match が書け、実在しないラベルを混入させられない。

具体的な型設計・API・データ表現は実装時に決める。PDF 仕様は `docs/specs/` を参照。
`PdfError` の型別文脈と TS 版との差は [`docs/design/rust-pdf-error-context.md`](../docs/design/rust-pdf-error-context.md) を参照。

## 現在の状態

字句解析・オブジェクトモデル・パーサに加え、xref テーブル／ストリームと `/Prev` チェーン、
間接オブジェクトの遅延解決、オブジェクトストリーム、FlateDecode・Predictor を実装済み。
カタログ・ページツリー・継承属性・情報辞書を `PdfDocument` / `PdfPage` の公開 API から取得できる。
暗号化文書の復号・描画命令の解析・レンダリング・書き出しは未対応。

```rust
use pdfmod_core::{DocumentError, PdfDocument, PageNumber};

fn inspect(bytes: &[u8]) -> Result<(), DocumentError> {
    let mut document = PdfDocument::open(bytes)?;
    if let Some(number) = PageNumber::new(1) {
        if let Some(page) = document.page(number.into())? {
            println!("{} × {}", page.media_box().width(), page.media_box().height());
            let resources = page.resources();
            let streams = document.content_streams(&page)?;
        }
    }
    let count = document.page_count()?;
    let info = document.document_info()?;
    Ok(())
}
```

`open` は入力スライスを借用し、ヘッダ・xref・トレイラ・カタログまでを検証する。
`page(PageIndex)` は先頭から対象までの辞書だけを走査し、対象の継承属性を解決する。
`PageIndex` は0起点、`PageNumber` は1起点で、`Into` で変換する。範囲外は `Ok(None)`。
`page_count` は誤った `/Count` を信用せず初回に構造全体を走査し、実際の葉数を記憶する。
この走査では他ページの属性・リソース参照先・描画ストリームは解決しない。
繰り返しページ取得は毎回先頭から走査するため、大量ページのランダムアクセスの最適化は今後の課題。

`PdfPage::contents` は未解決の値を返す。`content_streams` を明示的に呼ぶと、
単一ストリーム・直接配列・配列への間接参照を記述順の `Rc<PdfObject>` 列へ解決する。
各要素は `PdfObject::Stream`。フィルタ展開・配列の結合はこの API では行わない。
リソース辞書内のフォント・画像などの参照は `resolve` で必要時に取得できる。
ページと参照は取得元の文書で使う。

`document_info` は要求時に `/Info` を解析し、不在なら空の結果を返す。
各項目の不正は独立して保持する。ツリーの警告は `page_tree_warnings`、
対象ページの属性回復警告は `PdfPage::warnings` で確認できる。
全構造の検証が必要な場合は `page_count` を呼ぶ。先頭ページだけの取得では、
後続ノードの破損や、未退出の祖先の Count 不一致は未検出のままになる。

```
rust/
├── Cargo.toml            # ワークスペース定義
├── README.md
├── .gitignore
└── crates/
    └── core/             # pdfmod-core クレート（PDF 処理エンジン）
        ├── Cargo.toml
        └── src/
            ├── lib.rs
            ├── document.rs, document/         # PdfDocument / PdfPage の公開 API
            ├── catalog.rs, document_info.rs   # カタログ・情報辞書
            ├── page_tree.rs, page_tree/       # ページツリー・継承属性
            ├── geometry.rs, page_boxes.rs     # 矩形・境界ボックス
            ├── resolver.rs, resolver/         # 間接オブジェクトの遅延解決
            ├── file.rs, xref.rs, object_stream.rs # ファイル構造・相互参照
            ├── filter.rs, filter/             # FlateDecode・Predictor
            ├── byte_offset.rs, error.rs       # オフセット・エラー
            ├── lexer.rs, object.rs, parser.rs # 字句解析・オブジェクト・構文解析
            └── text_string.rs, date.rs        # テキスト文字列・日付
```

## ビルド・テスト

```sh
cd rust
cargo build
cargo test
```

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```
