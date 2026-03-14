# 09. PDFライブラリ実装ガイドとベストプラクティス

## 1. 概要

適合リーダー、適合ライター、あるいはテキスト解析パーサーのいずれを開発する場合でも、PDFをソフトウェアのコードに落とし込む作業はシステム設計に対する極限のテストとなる。

## 2. 最小限のアーキテクチャパイプライン

### 2.1 モジュール構成

```
┌─────────────────────────────────────────────────────────────┐
│                    PDFライブラリ全体構成                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ レクサー /     │  │ グラフリゾルバ │  │ DOMトラバーサ     │  │
│  │ トークナイザ   │→│ / オブジェクト │→│                  │  │
│  │              │  │ キャッシュ     │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         ↓                 ↓                   ↓             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ ストリーム     │  │ フォント       │  │ ドキュメント      │  │
│  │ インタプリタ   │  │ サブシステム   │  │ ライター         │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 レクサー / トークナイザ（Lexer / Tokenizer）

バイトストリームからプリミティブトークンを生成する高度に最適化されたステートマシン。

```
入力: バイトストリーム
出力: 型付きトークン列

enum Token {
    Null,
    Boolean(bool),
    Integer(i64),
    Real(f64),
    LiteralString(Vec<u8>),
    HexString(Vec<u8>),
    Name(String),
    ArrayBegin,          // '['
    ArrayEnd,            // ']'
    DictBegin,           // '<<'
    DictEnd,             // '>>'
    StreamBegin,         // 'stream'
    StreamEnd,           // 'endstream'
    ObjBegin,            // 'obj'
    ObjEnd,              // 'endobj'
    IndirectRef {        // 'N G R'
        obj_num: u32,
        gen_num: u16,
    },
    Keyword(String),     // xref, trailer, startxref, etc.
    Comment(String),     // '%...'
}
```

#### 実装上のポイント

- **ゼロコピー設計**: 可能な限りバッファの割り当てを避け、入力バイト列への参照を使用
- **先読み（Lookahead）**: `<<` と `<hex>` の区別には最低2バイトの先読みが必要
- **間接参照の認識**: `N G R` パターンを認識するために3トークンのバックトラッキングが必要
- **ストリームデータ**: `/Length` を事前に解決してからストリームデータを読み込む

### 2.3 グラフリゾルバとオブジェクトキャッシュ（Graph Resolver）

xrefテーブルを解析し、インダイレクト参照を実際のオブジェクトに解決するレイヤ。

```
struct ObjectResolver {
    xref: MergedXRefTable,
    file: RandomAccessFile,
    cache: LruCache<ObjectId, PdfObject>,
    resolving: HashSet<ObjectId>,  // 循環参照検出用
}

impl ObjectResolver {
    fn resolve(&mut self, obj_ref: &IndirectRef) -> Result<&PdfObject> {
        let id = obj_ref.to_id();

        // キャッシュチェック
        if self.cache.contains(&id) {
            return Ok(self.cache.get(&id).unwrap());
        }

        // 循環参照チェック
        if !self.resolving.insert(id) {
            return Err(Error::CircularReference(id));
        }

        // xrefからオブジェクトの位置を取得
        let location = self.xref.get_location(id)?;

        // オブジェクトの読み込み（遅延読み込み）
        let object = match location {
            ObjectLocation::DirectOffset(offset) => {
                self.file.seek(offset);
                parse_indirect_object(&mut self.file)?
            }
            ObjectLocation::InObjectStream { stream_obj, index } => {
                let stream = self.resolve_object_stream(stream_obj)?;
                extract_from_object_stream(stream, index)?
            }
        };

        // キャッシュに格納
        self.resolving.remove(&id);
        self.cache.put(id, object);
        Ok(self.cache.get(&id).unwrap())
    }
}
```

#### 遅延読み込み（Lazy Loading）

- ギガバイト級のPDFを開いた際にRAMを枯渇させない
- 要求されるまでオブジェクトの実体をメモリにロードしない
- LRUキャッシュでメモリ使用量を制限

### 2.4 DOMトラバーサ（DOM Traverser）

`/Catalog` から始まり、`/Pages` ツリーを巡回するモジュール。

```
struct DocumentTraverser {
    resolver: ObjectResolver,
}

impl DocumentTraverser {
    fn build_page_list(&mut self) -> Result<Vec<ResolvedPage>> {
        let catalog = self.resolver.resolve_catalog()?;
        let pages_root = catalog.get_pages_root()?;
        let mut pages = Vec::new();
        let mut visited = HashSet::new();
        self.collect_pages(pages_root, &mut pages, &mut visited)?;
        Ok(pages)
    }

    fn collect_pages(
        &mut self,
        node: &PdfObject,
        pages: &mut Vec<ResolvedPage>,
        visited: &mut HashSet<ObjectId>,
    ) -> Result<()> {
        // 循環参照チェック
        let node_id = node.object_id();
        if !visited.insert(node_id) {
            return Ok(()); // 循環検出 - スキップ
        }

        match node.get_type()? {
            "/Pages" => {
                for kid in node.get_kids()? {
                    let resolved = self.resolver.resolve(&kid)?;
                    self.collect_pages(resolved, pages, visited)?;
                }
            }
            "/Page" => {
                // 継承された属性を解決
                let resolved_page = ResolvedPage {
                    media_box: self.resolve_inherited(node, "/MediaBox")?,
                    resources: self.resolve_inherited(node, "/Resources")?,
                    crop_box: self.resolve_inherited(node, "/CropBox"),
                    rotate: self.resolve_inherited(node, "/Rotate"),
                    contents: node.get("/Contents"),
                    annots: node.get("/Annots"),
                };
                pages.push(resolved_page);
            }
            _ => { /* 不明なタイプは無視 */ }
        }

        Ok(())
    }
}
```

### 2.5 ストリームインタプリタ（Stream Interpreter）

スタックベースのPostScriptオペランドとオペレータを評価するレンダリングの心臓部。

```
struct StreamInterpreter {
    operand_stack: Vec<PdfObject>,
    graphics_state: GraphicsStateStack,
    resources: ResourceDict,
    output: Box<dyn RenderTarget>,
}

impl StreamInterpreter {
    fn execute(&mut self, stream_data: &[u8]) -> Result<()> {
        let tokens = tokenize_content_stream(stream_data);

        for token in tokens {
            match token {
                Token::Integer(_) | Token::Real(_) | Token::Name(_)
                | Token::LiteralString(_) | Token::HexString(_)
                | Token::ArrayBegin | Token::ArrayEnd => {
                    // オペランド → スタックにプッシュ
                    self.operand_stack.push(token.to_object());
                }
                Token::Keyword(op) => {
                    // オペレータ → スタックからポップして実行
                    self.execute_operator(&op)?;
                }
                _ => {}
            }
        }

        Ok(())
    }

    fn execute_operator(&mut self, op: &str) -> Result<()> {
        match op {
            // グラフィックスステート
            "q" => self.graphics_state.save(),
            "Q" => self.graphics_state.restore(),
            "cm" => {
                let f = self.pop_number()?;
                let e = self.pop_number()?;
                let d = self.pop_number()?;
                let c = self.pop_number()?;
                let b = self.pop_number()?;
                let a = self.pop_number()?;
                self.graphics_state.concat_matrix(a, b, c, d, e, f);
            }
            "w" => self.graphics_state.set_line_width(self.pop_number()?),

            // パス構築
            "m" => { /* moveto */ }
            "l" => { /* lineto */ }
            "c" => { /* curveto */ }
            "h" => { /* closepath */ }
            "re" => { /* rectangle */ }

            // パス描画
            "S" => self.stroke()?,
            "f" | "F" => self.fill(FillRule::NonZeroWinding)?,
            "f*" => self.fill(FillRule::EvenOdd)?,
            "B" => self.fill_and_stroke(FillRule::NonZeroWinding)?,
            "n" => self.discard_path(),

            // 色
            "rg" => { /* set fill color RGB */ }
            "RG" => { /* set stroke color RGB */ }
            "g" => { /* set fill color gray */ }
            "G" => { /* set stroke color gray */ }
            "k" => { /* set fill color CMYK */ }
            "K" => { /* set stroke color CMYK */ }

            // テキスト
            "BT" => self.begin_text(),
            "ET" => self.end_text(),
            "Tf" => { /* set font */ }
            "Td" => { /* move text position */ }
            "Tm" => { /* set text matrix */ }
            "Tj" => { /* show string */ }
            "TJ" => { /* show string array with positioning */ }

            // XObject
            "Do" => {
                let name = self.pop_name()?;
                self.draw_xobject(&name)?;
            }

            // 拡張ステート
            "gs" => {
                let name = self.pop_name()?;
                self.apply_ext_gstate(&name)?;
            }

            _ => { /* 未知のオペレータは無視（寛容処理） */ }
        }
        Ok(())
    }
}
```

## 3. 構造的なカオスへの対処

### 3.1 Postelの法則の適用

> 「送信するものについては厳密に、受信するものについては寛容に」

実世界のPDFファイルに存在する構造的な問題の例:

| 問題 | 発生頻度 | 対処法 |
|:-----|:---------|:-------|
| xrefオフセットの数バイトのずれ | 高 | 前後数バイトの範囲で `obj` キーワードを探索 |
| %%EOFマーカーの欠落 | 中 | ファイル末尾から `startxref` を直接探索 |
| 文字列リテラルのエスケープ不完全 | 中 | ヒューリスティックに括弧のバランスを判定 |
| /Pages ツリーの循環参照 | 低 | 訪問済みオブジェクトIDの追跡で検出 |
| /Count 値の不正 | 中 | 実際のページ数を再計算 |
| 重複するオブジェクト番号 | 低 | 最後に定義されたものを優先 |
| 不正なストリーム長 | 中 | `endstream` キーワードの位置から逆算 |

### 3.2 循環参照の検出

```
fn traverse_with_cycle_detection<F>(
    root: &PdfObject,
    resolver: &mut ObjectResolver,
    visitor: F,
) -> Result<()>
where F: FnMut(&PdfObject) -> Result<()>
{
    let mut visited = HashSet::new();
    let mut stack = vec![root.object_id()];

    while let Some(current_id) = stack.pop() {
        if !visited.insert(current_id) {
            // 循環参照を検出 - ログ出力してスキップ
            log::warn!("Circular reference detected: object {}", current_id);
            continue;
        }

        let obj = resolver.resolve_by_id(current_id)?;
        visitor(obj)?;

        // 子オブジェクトをスタックに追加
        for child_ref in obj.get_indirect_references() {
            stack.push(child_ref.to_id());
        }
    }

    Ok(())
}
```

### 3.3 フォールバックxrefスキャナ

xrefテーブルのパースに失敗した場合のフェイルセーフ。

```
fn rebuild_xref_by_scanning(file: &[u8]) -> Result<XRefTable> {
    let mut xref = XRefTable::new();

    // ファイル全体をスキャンして "N G obj" パターンを検出
    let obj_pattern = Regex::new(r"(\d+)\s+(\d+)\s+obj")?;

    let file_str = String::from_utf8_lossy(file);
    for capture in obj_pattern.captures_iter(&file_str) {
        let obj_num: u32 = capture[1].parse()?;
        let gen_num: u16 = capture[2].parse()?;
        let offset = capture.get(0).unwrap().start();

        xref.add_entry(obj_num, gen_num, offset as u64, true);
    }

    Ok(xref)
}
```

### 3.4 ストリーム長の修正

```
fn find_stream_end(data: &[u8], declared_length: usize) -> usize {
    // まず宣言された長さを信用
    if declared_length > 0 && declared_length < data.len() {
        let expected_end = &data[declared_length..];
        if expected_end.starts_with(b"endstream") ||
           expected_end.starts_with(b"\nendstream") ||
           expected_end.starts_with(b"\r\nendstream") {
            return declared_length;
        }
    }

    // 宣言された長さが不正な場合、endstreamを直接探索
    if let Some(pos) = find_bytes(data, b"endstream") {
        // 直前のEOLを除外
        let mut end = pos;
        if end > 0 && data[end - 1] == b'\n' { end -= 1; }
        if end > 0 && data[end - 1] == b'\r' { end -= 1; }
        return end;
    }

    declared_length // フォールバック
}
```

## 4. 開発言語の選定

### 4.1 言語比較

| 言語 | 長所 | 短所 | 代表的なライブラリ |
|:-----|:-----|:-----|:-------------------|
| C/C++ | 最高性能、既存資産が豊富 | メモリ安全性の欠如、セキュリティリスク | PDFium, Ghostscript, qpdf, libHaru |
| Rust | メモリ安全性、C++同等の性能 | 学習曲線、エコシステムの成熟度 | lopdf, pdf-rs |
| Java/Kotlin | GC、クロスプラットフォーム | メモリ使用量、GCの停止 | Apache PDFBox, iText |
| C# | GC、Windowsとの親和性 | クロスプラットフォーム制約 | PdfSharp, Aspose.PDF |
| Python | 開発速度、エコシステム | 実行速度 | pypdf, pikepdf, reportlab |
| Go | 並行処理、シンプルさ | ジェネリクスの制限 | pdfcpu, unipdf |

### 4.2 Rustの利点

PDFライブラリ開発においてRustが特に有効な理由。

- **所有権モデル**: オブジェクトグラフの複雑なライフサイクル管理をコンパイル時に検証
- **バッファオーバーフロー防止**: 信頼できない外部バイナリの解析における最大の攻撃ベクタを排除
- **Use-After-Free防止**: 解放後メモリの使用をコンパイル時に防止
- **ゼロコスト抽象化**: 安全性を保ちながらC++同等の実行速度
- **パターンマッチング**: PDFの複雑な型分岐を安全かつ網羅的に処理

### 4.3 セキュリティ上の考慮事項

信頼できないPDFファイルの解析は以下の攻撃ベクタに対して脆弱。

| 攻撃ベクタ | 説明 | 対策 |
|:-----------|:-----|:-----|
| バッファオーバーフロー | 不正なxrefオフセットや文字列長 | 境界チェック、安全な言語の使用 |
| Use-After-Free | 解放されたオブジェクトへの参照 | 所有権管理、GCまたはRust |
| 整数オーバーフロー | 巨大なオブジェクト番号や長さ | チェック付き算術演算 |
| スタックオーバーフロー | 深くネストされた構造、循環参照 | 深度制限、循環検出 |
| リソース枯渇 | 巨大なストリーム、zip bomb | サイズ制限、展開比率の監視 |
| パストラバーサル | 埋め込みファイル名 | ファイル名のサニタイズ |

## 5. テスト戦略

### 5.1 テストカテゴリ

| カテゴリ | 内容 |
|:---------|:-----|
| ユニットテスト | 各プリミティブ型のパース、個別オペレータの処理 |
| 統合テスト | 完全なPDFファイルの読み込み・検証 |
| ファズテスト | ランダムなバイト列による堅牢性テスト |
| 適合性テスト | ISO 32000仕様への準拠確認 |
| リグレッションテスト | 実世界のPDFファイルコレクションによるテスト |
| パフォーマンステスト | 大規模PDFの処理時間・メモリ使用量 |

### 5.2 テストデータ

```
推奨テストファイル:
- 最小有効PDF（手書きで構築）
- Standard 14 Fontsのみ使用するPDF
- CJKフォント（日本語、中国語、韓国語）を含むPDF
- 複数の圧縮フィルタを使用するPDF
- インクリメンタルアップデートされたPDF
- リニアライズされたPDF
- 暗号化されたPDF（各アルゴリズム）
- オブジェクトストリーム/XRefストリームを使用するPDF
- 100ページ以上の大規模PDF
- 意図的に破損したPDF（フォールバック処理のテスト）
```

## 6. パフォーマンス最適化のガイドライン

| 最適化項目 | 手法 |
|:-----------|:-----|
| I/O | メモリマップドファイル（mmap）の使用 |
| パース | ゼロコピーパーシング、不要なアロケーション回避 |
| オブジェクト解決 | LRUキャッシュ、遅延読み込み |
| ストリーム展開 | ストリーミングデコーダ（全体をバッファリングしない） |
| ページツリー | `/Count` を利用したO(log n)のページアクセス |
| フォント | フォントメトリクスのキャッシュ |
| 描画 | タイルベースレンダリング、必要な領域のみ描画 |
