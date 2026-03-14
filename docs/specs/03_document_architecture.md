# 03. 論理ドキュメントアーキテクチャとページツリー

## 1. 概要

PDFの論理構造は、**ドキュメントカタログ（Document Catalog）を頂点とする有向非巡回グラフ（DAG）**としてモデリングされている。物理ファイルのインデックス構造が解決されると、オブジェクト間の参照関係からなる論理的なドキュメント構造が展開される。

## 2. ドキュメントカタログ

トレイラ辞書の `/Root` エントリからアクセスされるドキュメント全体のルート辞書。

### 2.1 カタログ辞書の構造

```
1 0 obj
<< /Type /Catalog
   /Pages 2 0 R
   /Version /1.7
   /ViewerPreferences << /DisplayDocTitle true >>
   /Outlines 10 0 R
   /Names 20 0 R
   /MarkInfo << /Marked true >>
   /Lang (ja-JP)
>>
endobj
```

### 2.2 カタログ辞書の主要エントリ

| キー | 型 | 必須 | 説明 |
|:-----|:---|:-----|:-----|
| `/Type` | 名前 | **必須** | 必ず `/Catalog` |
| `/Pages` | 間接参照 | **必須** | ページツリーのルートノードへの参照 |
| `/Version` | 名前 | 任意 | ヘッダのバージョンを上書きする場合に使用 |
| `/ViewerPreferences` | 辞書 | 任意 | ビューアの表示設定 |
| `/Outlines` | 間接参照 | 任意 | アウトライン（しおり/ブックマーク）のルート |
| `/Names` | 辞書 | 任意 | 名前辞書（名前付き宛先など） |
| `/Dests` | 辞書 | 任意 | 名前付き宛先辞書（PDF 1.1互換） |
| `/MarkInfo` | 辞書 | 任意 | タグ付きPDF（アクセシビリティ）の情報 |
| `/StructTreeRoot` | 辞書 | 任意 | 構造ツリーのルート（タグ付きPDF） |
| `/Lang` | 文字列 | 任意 | ドキュメントの自然言語（BCP 47形式） |
| `/PageLayout` | 名前 | 任意 | ページレイアウトモード |
| `/PageMode` | 名前 | 任意 | 表示モード（しおり表示など） |
| `/AcroForm` | 辞書 | 任意 | インタラクティブフォームの定義 |
| `/Metadata` | ストリーム | 任意 | XMPメタデータストリーム |

### 2.3 PageLayout の値

| 値 | 説明 |
|:---|:-----|
| `/SinglePage` | 1ページずつ表示（デフォルト） |
| `/OneColumn` | 単一列の連続スクロール |
| `/TwoColumnLeft` | 2列表示（奇数ページが左） |
| `/TwoColumnRight` | 2列表示（奇数ページが右） |
| `/TwoPageLeft` | 見開き表示（奇数ページが左） |
| `/TwoPageRight` | 見開き表示（奇数ページが右） |

### 2.4 PageMode の値

| 値 | 説明 |
|:---|:-----|
| `/UseNone` | アウトラインパネルもサムネイルパネルも非表示（デフォルト） |
| `/UseOutlines` | アウトライン（しおり）パネルを表示 |
| `/UseThumbs` | ページサムネイルパネルを表示 |
| `/FullScreen` | 全画面モード |
| `/UseOC` | オプショナルコンテンツパネルを表示 |
| `/UseAttachments` | 添付ファイルパネルを表示 |

## 3. ページツリー（Page Tree）

### 3.1 ツリー構造の概要

ページオブジェクトは単なる一次元配列ではなく、**平衡木（Balanced Tree）に似た階層構造**で編成される。

```
                    /Pages (Root)
                   /Count 100
                  /      \
           /Pages         /Pages
          /Count 50      /Count 50
         /   \           /    \
      /Pages  /Pages  /Pages  /Pages
      ...     ...     ...     ...
        |       |       |       |
      /Page   /Page   /Page   /Page
      (末端)   (末端)   (末端)   (末端)
```

### 3.2 ページツリーノード（/Pages）

中間ノードの辞書構造。

```
2 0 obj
<< /Type /Pages
   /Kids [3 0 R 4 0 R 5 0 R]
   /Count 3
>>
endobj
```

#### 必須エントリ

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Type` | 名前 | 必ず `/Pages` |
| `/Kids` | 配列 | 子ノードへの間接参照の配列。要素は `/Pages` または `/Page` |
| `/Count` | 整数 | このノード配下にある**末端ページの総数** |

#### 任意エントリ（継承可能）

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Parent` | 間接参照 | 親ノードへの参照（ルートノードには存在しない） |
| `/MediaBox` | 配列 | ページの物理的な寸法 |
| `/Resources` | 辞書 | 描画リソース辞書 |
| `/CropBox` | 配列 | トリミング領域 |
| `/Rotate` | 整数 | ページの回転角度（0, 90, 180, 270） |

### 3.3 ページオブジェクト（/Page）

末端の葉ノード。1枚のページを描画するために必要な情報をカプセル化した辞書。

```
3 0 obj
<< /Type /Page
   /Parent 2 0 R
   /MediaBox [0 0 612 792]
   /Resources << /Font << /F1 6 0 R >> >>
   /Contents 4 0 R
>>
endobj
```

#### 必須エントリ

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Type` | 名前 | 必ず `/Page` |
| `/Parent` | 間接参照 | 親の `/Pages` ノードへの逆参照 |

#### 実質必須（直接または継承により必要）

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/MediaBox` | 配列 | ページの物理的寸法 `[llx lly urx ury]`（PostScriptポイント単位、1pt = 1/72インチ） |
| `/Resources` | 辞書 | 描画に使用されるリソースの定義 |

#### 主要な任意エントリ

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Contents` | 間接参照 or 配列 | 描画命令のストリームへの参照。配列の場合は連結して処理 |
| `/CropBox` | 配列 | 表示・印刷時のクリッピング領域（デフォルトは `/MediaBox` と同じ） |
| `/BleedBox` | 配列 | 裁ち落とし領域 |
| `/TrimBox` | 配列 | 仕上がりサイズ |
| `/ArtBox` | 配列 | コンテンツ領域 |
| `/Rotate` | 整数 | 表示時の回転角度（0, 90, 180, 270度）。デフォルトは0 |
| `/Annots` | 配列 | ページ上の注釈（アノテーション）のリスト |
| `/Thumb` | ストリーム | ページのサムネイル画像 |
| `/UserUnit` | 実数 | ユーザー空間の単位倍率（PDF 1.6以降、デフォルト1.0） |

### 3.4 ページサイズの定義（ボックスモデル）

```
+------------------------------------------+
| MediaBox (物理的なメディアサイズ)           |
|  +--------------------------------------+|
|  | BleedBox (裁ち落とし領域)              ||
|  |  +----------------------------------+||
|  |  | TrimBox (仕上がりサイズ)           |||
|  |  |  +------------------------------+|||
|  |  |  | ArtBox (コンテンツ領域)        ||||
|  |  |  |                              ||||
|  |  |  +------------------------------+|||
|  |  +----------------------------------+||
|  +--------------------------------------+|
+------------------------------------------+
```

#### ボックスの座標フォーマット

```
[llx lly urx ury]

llx: 左下X座標 (Lower-Left X)
lly: 左下Y座標 (Lower-Left Y)
urx: 右上X座標 (Upper-Right X)
ury: 右上Y座標 (Upper-Right Y)

単位: PostScriptポイント (1pt = 1/72インチ)
```

#### 標準的なページサイズ

| サイズ名 | MediaBox値 | 寸法 |
|:---------|:-----------|:-----|
| Letter | [0 0 612 792] | 8.5 x 11 インチ |
| A4 | [0 0 595.276 841.89] | 210 x 297 mm |
| A3 | [0 0 841.89 1190.55] | 297 x 420 mm |
| Legal | [0 0 612 1008] | 8.5 x 14 インチ |
| B5 | [0 0 498.898 708.661] | 176 x 250 mm |

## 4. ページ属性の継承メカニズム

### 4.1 継承ルール

ISO 32000仕様により、以下の属性はページツリーの階層を通じて**継承可能**である。

| 継承可能な属性 | 説明 |
|:---------------|:-----|
| `/MediaBox` | ページの物理的寸法 |
| `/Resources` | リソース辞書 |
| `/CropBox` | トリミング領域 |
| `/Rotate` | 回転角度 |

#### 継承の解決アルゴリズム

```
fn resolve_inherited_attribute(page: &PageObject, attr_name: &str) -> Option<PdfObject> {
    // 1. ページ自身に属性が定義されているか確認
    if let Some(value) = page.dictionary.get(attr_name) {
        return Some(value.clone());
    }

    // 2. /Parent 参照を辿って上位ノードを探索
    let mut current = page.parent;
    while let Some(parent_node) = current {
        if let Some(value) = parent_node.dictionary.get(attr_name) {
            return Some(value.clone());
        }
        current = parent_node.parent;
    }

    // 3. ルートノードまで遡っても見つからない場合はNone
    None
}
```

### 4.2 継承メカニズムの落とし穴

**開発者が最も頻繁に陥るアーキテクチャ上の罠**。

#### 問題のシナリオ

```
ページツリー:
  /Pages (Root)
    /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >>   ← ここにリソースが定義
    /Kids [3 0 R]
      /Page (obj 3)
        /Parent 2 0 R
        ※ /Resources は定義されていない → 親から継承

危険な実装:
  page.get("/Resources")  → None
  page.set("/Resources", new_empty_dict())  ← ★これが問題！
  page.resources.add("/F3", new_font_ref)

結果:
  ページに空の /Resources が直接設定される
  → 親から継承されていた /F1, /F2 がシャドウイング（隠蔽）される
  → 既存のテキスト描画が全て失敗する
```

#### 正しい実装

```
fn add_resource_to_page(page: &mut PageObject, key: &str, value: PdfObject) {
    // 1. ページに直接 /Resources が存在するか確認
    if page.dictionary.get("/Resources").is_none() {
        // 2. 継承された /Resources をツリーから取得
        let inherited = resolve_inherited_attribute(page, "/Resources");

        // 3. 継承されたリソースをディープコピーしてページに直接設定
        if let Some(resources) = inherited {
            page.dictionary.set("/Resources", deep_clone(resources));
        } else {
            page.dictionary.set("/Resources", PdfDictionary::new());
        }
    }

    // 4. ローカルコピーされたリソースに新しいエントリを追加
    let resources = page.dictionary.get_mut("/Resources").unwrap();
    resources.set(key, value);
}
```

### 4.3 ページツリーの走査アルゴリズム

#### ページ番号によるランダムアクセス

```
fn get_page(pages_node: &PagesNode, page_index: usize) -> Result<&PageObject> {
    let mut remaining = page_index;

    for kid in &pages_node.kids {
        match kid.type_name() {
            "/Page" => {
                if remaining == 0 {
                    return Ok(kid.as_page());
                }
                remaining -= 1;
            }
            "/Pages" => {
                let subtree_count = kid.as_pages().count;
                if remaining < subtree_count {
                    // 目的のページはこのサブツリー内にある
                    return get_page(kid.as_pages(), remaining);
                }
                remaining -= subtree_count;
            }
        }
    }

    Err(Error::PageNotFound)
}
```

#### 全ページの順次走査

```
fn iterate_pages(pages_node: &PagesNode, visitor: &mut dyn PageVisitor) {
    // 循環参照検出用のセット
    let visited = HashSet::new();
    iterate_pages_inner(pages_node, visitor, &mut visited);
}

fn iterate_pages_inner(
    node: &PagesNode,
    visitor: &mut dyn PageVisitor,
    visited: &mut HashSet<ObjectId>,
) {
    // 循環参照チェック
    if !visited.insert(node.object_id) {
        return; // 既に訪問済み → 循環参照を検出
    }

    for kid in &node.kids {
        match kid.type_name() {
            "/Page" => visitor.visit_page(kid.as_page()),
            "/Pages" => iterate_pages_inner(kid.as_pages(), visitor, visited),
            _ => { /* 不明なタイプは無視 */ }
        }
    }
}
```

## 5. ドキュメント情報辞書

トレイラの `/Info` エントリから参照される辞書。

```
5 0 obj
<< /Title (Sample PDF)
   /Author (John Doe)
   /Subject (PDF Specification)
   /Creator (MyApp)
   /Producer (MyPDFLib 1.0)
   /CreationDate (D:20260314120000+09'00')
   /ModDate (D:20260314120000+09'00')
>>
endobj
```

### 5.1 情報辞書のエントリ

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Title` | テキスト文字列 | ドキュメントのタイトル |
| `/Author` | テキスト文字列 | 作成者名 |
| `/Subject` | テキスト文字列 | ドキュメントの主題 |
| `/Keywords` | テキスト文字列 | キーワード |
| `/Creator` | テキスト文字列 | 元のドキュメントを作成したアプリケーション名 |
| `/Producer` | テキスト文字列 | PDFに変換したアプリケーション名 |
| `/CreationDate` | 日時文字列 | 作成日時 |
| `/ModDate` | 日時文字列 | 最終更新日時 |
| `/Trapped` | 名前 | トラッピング状態 (`/True`, `/False`, `/Unknown`) |

### 5.2 PDF日時文字列フォーマット

```
D:YYYYMMDDHHmmSSOHH'mm'

D:          - プレフィックス（必須）
YYYY        - 年（4桁）
MM          - 月（01-12）
DD          - 日（01-31）
HH          - 時（00-23）
mm          - 分（00-59）
SS          - 秒（00-59）
O           - UTCとの関係: '+' / '-' / 'Z'
HH'mm'      - UTCからのオフセット（時分）

例: D:20260314120000+09'00'  → 2026年3月14日 12:00:00 JST
```

## 6. アウトライン（しおり/ブックマーク）

ドキュメントカタログの `/Outlines` エントリから参照される階層的なナビゲーション構造。

```
10 0 obj
<< /Type /Outlines
   /First 11 0 R
   /Last 12 0 R
   /Count 3
>>
endobj

11 0 obj
<< /Title (Chapter 1)
   /Parent 10 0 R
   /Next 12 0 R
   /Dest [3 0 R /FitH 720]
>>
endobj
```

### 6.1 アウトラインエントリのキー

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Title` | テキスト文字列 | 表示テキスト |
| `/Parent` | 間接参照 | 親エントリへの参照 |
| `/First` | 間接参照 | 最初の子エントリ |
| `/Last` | 間接参照 | 最後の子エントリ |
| `/Prev` | 間接参照 | 前の兄弟エントリ |
| `/Next` | 間接参照 | 次の兄弟エントリ |
| `/Count` | 整数 | 子孫エントリの数（負の場合は折りたたみ状態） |
| `/Dest` | 配列 or 名前 | ジャンプ先のページ位置 |
| `/A` | 辞書 | 実行するアクション |
