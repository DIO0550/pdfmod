# 08. インクリメンタルアップデートとリニアライズ

## 1. 概要

PDF仕様は、ファイルの変更に関して2つの相反する構造的アプローチを提供している。

| アプローチ | 目的 | 方向 |
|:-----------|:-----|:-----|
| インクリメンタルアップデート | 効率的なファイル編集・保存 | ファイル末尾に追記 |
| リニアライズ（Fast Web View） | ネットワーク配信の最適化 | ファイル構造の再配置 |

**重要**: この2つは構造的に相反し、互いに排他的である。

## 2. インクリメンタルアップデート

### 2.1 基本原理

PDFファイルに変更を加える際、元のファイルのバイト列には**一切手を加えない**。変更・追加されたオブジェクトをファイル末尾に追記する。

```
+----------------------------------+
| 元のヘッダ                        |
| 元のボディ                        |
| 元のxrefテーブル                   |
| 元のトレイラ                       |
| 元の%%EOF                         |
+----------------------------------+  ← 元のファイル終端
| 新しい/変更されたオブジェクト群     |  ← 追記部分
| 新しいxrefテーブル                 |
| 新しいトレイラ (/Prev付き)         |
| 新しい%%EOF                       |
+----------------------------------+
```

### 2.2 使用シーン

- フォームへの入力データの保存
- 注釈（アノテーション）の追加
- デジタル署名の適用
- ページの追加・削除
- メタデータの変更

### 2.3 インクリメンタルアップデートの構造

#### 追記されるトレイラ辞書

```
trailer
<< /Size 25
   /Root 1 0 R
   /Prev 408          % ← 前のxrefテーブルのバイトオフセット
   /Info 5 0 R
>>
startxref
1024                   % 新しいxrefテーブルのバイトオフセット
%%EOF
```

#### /Prev キーの役割

- 直前の（古い）xrefテーブルのバイトオフセットを記録
- パーサーはこのキーを辿って古いxrefテーブルに再帰的にジャンプ
- **xrefテーブルの連鎖**が形成される

### 2.4 解析アルゴリズム

```
fn parse_incremental_pdf(file: &[u8]) -> Result<MergedXRef> {
    // 1. 最後尾の %%EOF から新しいxrefテーブルを読み込む
    let (latest_xref, latest_trailer) = parse_latest_xref(file)?;

    // 2. マージ済みxrefテーブルを初期化（最新のエントリ）
    let mut merged = MergedXRef::from(latest_xref);

    // 3. /Prev を辿って古いxrefテーブルを再帰的に読み込む
    let mut prev_offset = latest_trailer.get_prev();
    let mut visited_offsets = HashSet::new(); // 無限ループ防止

    while let Some(offset) = prev_offset {
        // 循環参照チェック
        if !visited_offsets.insert(offset) {
            break; // 既に訪問済みのオフセット
        }

        let (old_xref, old_trailer) = parse_xref_at(file, offset)?;

        // 4. 古いテーブルのオブジェクトをマージ
        //    すでに新しいテーブルに同じオブジェクト番号が存在する場合は
        //    古い方を破棄（新しい方が優先）
        for (obj_id, entry) in old_xref.entries() {
            merged.insert_if_absent(obj_id, entry);
        }

        prev_offset = old_trailer.get_prev();
    }

    Ok(merged)
}
```

### 2.5 オブジェクトの削除

オブジェクトを削除する場合、新しいxrefテーブルでそのエントリに `f` (free) フラグを設定し、世代番号をインクリメントする。

```
xref
0 1
0000000000 65535 f         % オブジェクト0: 空きリストのヘッド
5 1
0000000000 00003 f         % オブジェクト5を削除（世代番号2→3）
```

#### 削除の仕組み

| フィールド | 値 | 説明 |
|:-----------|:---|:-----|
| オフセット | 次の空きオブジェクト番号 | 空きオブジェクト連結リストの次要素 |
| 世代番号 | インクリメントされた値 | 将来の再利用時の世代番号 |
| フラグ | `f` | 空き（free）状態 |

### 2.6 ネイティブなバージョン管理

インクリメンタルアップデートにより、PDFはファイル内に**ネイティブなバージョン管理システム**を内包する。

```
ロールバック方法:
1. ファイルの末尾から最後のアップデートセクションを特定
2. 最後のアップデートの開始位置（前の%%EOF + 1）で切り捨て
3. 前のバージョンのPDFが完全に復元される

fn rollback_last_update(file: &mut Vec<u8>) -> Result<()> {
    // 最後の%%EOFの位置を特定
    let last_eof = find_last_eof(file)?;

    // その前の%%EOFの位置を特定（存在する場合）
    let prev_eof = find_prev_eof(file, last_eof)?;

    // 前の%%EOFの直後（改行を含む）で切り捨て
    let truncate_pos = prev_eof + b"%%EOF\n".len();
    file.truncate(truncate_pos);

    Ok(())
}
```

### 2.7 適合ライターの実装要件

```
fn save_incremental(file: &mut Vec<u8>, changes: &[PdfChange]) -> Result<()> {
    let original_length = file.len();

    // 1. 変更されたオブジェクトをファイル末尾に書き込み
    let mut new_xref_entries = Vec::new();
    for change in changes {
        let offset = file.len();
        write_object(file, &change.object)?;
        new_xref_entries.push(XRefEntry {
            obj_num: change.obj_num,
            gen_num: change.gen_num,
            offset,
            in_use: change.is_deletion == false,
        });
    }

    // 2. 新しいxrefテーブルを書き込み
    let xref_offset = file.len();
    write_xref_table(file, &new_xref_entries)?;

    // 3. 新しいトレイラ辞書を書き込み（/Prevを含む）
    let prev_xref_offset = find_startxref_value(file, original_length)?;
    write_trailer(file, TrailerDict {
        size: calculate_new_size(&new_xref_entries),
        root: get_root_ref(file)?,
        prev: Some(prev_xref_offset),
        ..Default::default()
    })?;

    // 4. startxref と %%EOF を書き込み
    writeln!(file, "startxref")?;
    writeln!(file, "{}", xref_offset)?;
    writeln!(file, "%%EOF")?;

    Ok(())
}
```

## 3. リニアライズ（Fast Web View）

### 3.1 基本原理

ファイル全体のダウンロードが完了する前に**最初のページを即座にストリーミング表示**できるよう、ファイルの内部構造を完全に再配置する。

### 3.2 標準PDFの問題

```
標準的なPDF:
  ヘッダ → ボディ(全オブジェクト) → xref → トレイラ → %%EOF
                                            ↑
                                    最後にここを読む

問題: トレイラとカタログがファイル末尾にあるため、
      1ページ目を表示するにはファイル全体のDLが必要
```

### 3.3 リニアライズされたPDFの構造

```
+-------------------------------------------+
| ヘッダ (%PDF-1.7)                          |
+-------------------------------------------+
| リニアライズ化パラメータ辞書               |  ← 先頭付近
+-------------------------------------------+
| 1ページ目用xrefテーブル (Part 1)           |
+-------------------------------------------+
| ドキュメントカタログ                       |
| ページツリーのルート                       |
| 1ページ目のページ辞書                      |
| 1ページ目のフォント                        |
| 1ページ目の画像                            |
| 1ページ目のコンテンツストリーム             |
+-------------------------------------------+  ← ここまでで1ページ目表示可能
| 残りのページのオブジェクト群               |
+-------------------------------------------+
| 残りのページ用xrefテーブル (Part 2)        |
+-------------------------------------------+
| トレイラ                                   |
| %%EOF                                      |
+-------------------------------------------+
```

### 3.4 リニアライズ化パラメータ辞書

ファイルヘッダの直後に配置される。

```
1 0 obj
<< /Linearized 1.0
   /L 54321          % ファイル全体のバイト数
   /H [200 50]       % ヒントテーブルのオフセットと長さ
   /O 5              % 1ページ目のオブジェクト番号
   /E 1024           % 1ページ目セクションの終了オフセット
   /N 10             % 総ページ数
   /T 53000          % メインxrefテーブルのオフセット
>>
endobj
```

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Linearized` | 実数 | リニアライズバージョン（常に1.0） |
| `/L` | 整数 | ファイルの総バイト数 |
| `/H` | 配列 | ヒントストリームの [オフセット, 長さ] |
| `/O` | 整数 | 1ページ目のページオブジェクト番号 |
| `/E` | 整数 | 1ページ目セクションの終了バイトオフセット |
| `/N` | 整数 | ドキュメントの総ページ数 |
| `/T` | 整数 | メインのxrefテーブル（またはXRefストリーム）のオフセット |

### 3.5 ヒントテーブル

残りのページのオブジェクト位置を効率的に特定するための追加インデックス。

#### ページオフセットヒントテーブル

各ページの描画に必要なオブジェクト群の位置情報を提供。

```
ページN を表示する場合:
1. ヒントテーブルからページNのオブジェクト位置を取得
2. 必要なバイト範囲のみをサーバーにリクエスト（HTTP Range Request）
3. 取得したデータからページNを描画
```

### 3.6 2段階xref構造

```
Part 1 xref (ファイル先頭付近):
  - ドキュメントカタログ
  - ページツリールート
  - 1ページ目関連の全オブジェクト

Part 2 xref (ファイル末尾付近):
  - 2ページ目以降のすべてのオブジェクト
  - ヒントテーブル
```

### 3.7 リニアライズの検出と検証

```
fn check_linearization(file: &[u8]) -> LinearizationStatus {
    // 1. ファイル先頭で /Linearized フラグを検出
    let first_obj = parse_first_object(file);
    let is_linearized = first_obj.get("/Linearized").is_some();

    if !is_linearized {
        return LinearizationStatus::NotLinearized;
    }

    // 2. ファイル末尾にインクリメンタルアップデートの追記がないか確認
    let eof_count = count_eof_markers(file);
    if eof_count > 1 {
        // インクリメンタルアップデートされている
        // → リニアライズの恩恵は失われている
        return LinearizationStatus::LinearizedButModified;
    }

    // 3. ファイルサイズの検証
    let param = parse_linearization_dict(first_obj);
    if param.file_length != file.len() {
        return LinearizationStatus::LinearizedButCorrupted;
    }

    LinearizationStatus::Valid(param)
}
```

## 4. インクリメンタルアップデートとリニアライズの相互排他性

### 4.1 構造的な非互換性

```
リニアライズされたPDF:
  - 1ページ目のオブジェクトがファイル先頭に集約
  - 最適化された2段階xref構造

インクリメンタルアップデート後:
  - 新しいオブジェクトがファイル末尾に追加
  - 先頭のデータ構造の完全性が崩壊
  - リニアライズの恩恵は完全に失われる
```

### 4.2 パーサーの判断ロジック

```
fn determine_parse_strategy(file: &[u8]) -> ParseStrategy {
    match check_linearization(file) {
        LinearizationStatus::Valid(param) => {
            // リニアライズが有効 → ストリーミング読み込み最適化
            ParseStrategy::LinearizedStreaming(param)
        }
        LinearizationStatus::LinearizedButModified => {
            // リニアライズ後に変更あり → 通常の末尾からの解析
            ParseStrategy::StandardFromEnd
        }
        LinearizationStatus::NotLinearized
        | LinearizationStatus::LinearizedButCorrupted => {
            // 非リニアライズ → 通常の末尾からの解析
            ParseStrategy::StandardFromEnd
        }
    }
}
```

### 4.3 再リニアライズ

インクリメンタルアップデート後にリニアライズの恩恵を再度得るには、ファイル全体を**完全に再構築**する必要がある。

```
再リニアライズの手順:
1. 全xrefチェーンをマージして完全なオブジェクトテーブルを構築
2. 不要な（削除された）オブジェクトを除外
3. 1ページ目に必要なオブジェクトを特定
4. リニアライズされた構造で新しいファイルを書き出す
5. ヒントテーブルを生成
6. 2段階xrefを構築
```

## 5. デジタル署名とインクリメンタルアップデート

### 5.1 署名の保全

デジタル署名されたPDFでは、インクリメンタルアップデートが**唯一の許容される変更方法**。

```
理由:
- デジタル署名は、署名時点のファイルバイト列のハッシュを計算
- 元のバイト列を変更すると署名が無効になる
- インクリメンタルアップデートなら元のバイト列は保持される
- 署名検証時に、署名時点までのバイト列でハッシュを再計算できる
```

### 5.2 署名のバイト範囲

```
署名辞書:
<< /Type /Sig
   /Filter /Adobe.PPKLite
   /SubFilter /adbe.pkcs7.detached
   /ByteRange [0 840 960 240]    % [offset1 length1 offset2 length2]
   /Contents <...署名データ...>
>>

ByteRange の意味:
  バイト 0〜839 と バイト 960〜1199 がハッシュ計算の対象
  バイト 840〜959 は /Contents の値（署名データ自体）なので除外
```
