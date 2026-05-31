# pdfmod (Rust)

pdfmod の **Rust 実装**（`pdfmod-core`）。PDF 処理エンジンを `std` のみで実装するワークスペース。

ISO 32000-1:2008 (PDF 1.7) / ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

## 設計方針

- **外部 crate 依存ゼロ。** Rust 標準ライブラリ (`std`) のみを使う。zlib/inflate などの
  フィルタ処理も自前で実装する。Cargo はビルド／テスト管理ツールとしてのみ使用する。
- **`Result` / `Option` は std のものをそのまま使う。** 値を生成するか失敗する操作は
  `Result<T, PdfError>`、値の有無は `Option<T>` で表す。独自のエラー／オプション型は作らない。
- **ID 値は newtype（タプル構造体）で表す。** `ObjectNumber` / `GenerationNumber` /
  `ByteOffset` などは裸の整数と混同しないよう newtype にし、生成・取り出しは関連関数
  `of()` / `value()` に統一する。
- **多態なオブジェクト値は `enum` で表す。** `PdfObject` / `XRefEntry` / `PdfErrorCode`
  などは `enum` で表現する。

### 整数型の選定（実装時の方針）

Rust では整数の型幅を明示する。以下は実装時に適用する方針:

| 型 | Rust 表現 | 根拠 |
|---|---|---|
| `ObjectNumber` | `u64` | オブジェクト番号は正の整数で仕様上の固定幅上限は無い。大きな値・将来の余裕を見込み u64 |
| `GenerationNumber` | `u16` | 世代番号は最大 5 桁 (65535) で `u16` にちょうど収まる |
| `ByteOffset` | `u64` | ファイル内オフセット（従来型 xref テーブルの 10 桁固定幅フィールドの保持値） |
| `PdfObject::Integer` | `i64` | PDF 整数オブジェクト |
| `PdfObject::Real` | `f64` | PDF 実数オブジェクト |

## 現在の状態

本 PR は **環境構築のみ**。Cargo ワークスペースの骨格と空の crate root だけを用意し、
PDF 処理の実装は含まない。各モジュールの実装は後続 PR で追加する。

```
rust/
├── Cargo.toml            # ワークスペース定義
├── README.md
├── .gitignore
└── crates/
    └── core/             # pdfmod-core クレート（PDF 処理エンジン）
        ├── Cargo.toml
        └── src/
            └── lib.rs    # 空の crate root（実装は後続 PR）
```

## ビルド・テスト

```sh
cd rust
cargo build
cargo test
```

> **注意:** 現在のコンテナには Rust ツールチェーン (`rustc` / `cargo`) が未インストール。
> devcontainer 再ビルド後（rustup 導入後）に `cargo build` / `cargo test` で検証すること。
