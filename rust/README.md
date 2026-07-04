# pdfmod (Rust)

pdfmod の **Rust 実装**（`pdfmod-core`）。PDF 処理エンジンを `std` のみで実装するワークスペース。

ISO 32000-1:2008 (PDF 1.7) / ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

## 設計方針

- **外部 crate 依存ゼロ。** Rust 標準ライブラリ (`std`) のみを使う。zlib/inflate などの
  フィルタ処理も自前で実装する。Cargo はビルド／テスト管理ツールとしてのみ使用する。
- **`Result` / `Option` は std のものを使う。** 独自のエラー／オプション型は作らない。

具体的な型設計・API・データ表現は実装時に決める。PDF 仕様は `docs/specs/` を参照。

## 現在の状態

字句解析・オブジェクトモデル・パーサ（Phase R1 相当）まで実装済み。xref / フィルタ /
ドキュメント構造 / コンテンツストリーム相当は未実装で、後続 PR で追加する。

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
            ├── byte_offset.rs   # バイトオフセットのブランド型
            ├── error/           # PdfError / PdfErrorCode
            ├── lexer/           # 字句解析（トークン、リテラル/16進文字列、EOL処理）
            ├── object/          # オブジェクトモデル（PdfObject、辞書、名前、ID、間接参照）
            └── parser/          # 構文解析（配列、辞書、間接参照）
```

## ビルド・テスト

```sh
cd rust
cargo build
cargo test
```

> **注意:** 現在のコンテナには Rust ツールチェーン (`rustc` / `cargo`) が未インストール。
> devcontainer 再ビルド後（rustup 導入後）に `cargo build` / `cargo test` で検証すること。
