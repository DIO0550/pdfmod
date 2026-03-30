# XRef Merger

`/Prev` チェーンを辿り、複数の xref セクションを1つのマージ済み `XRefTable` に統合するモジュール。

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## PDF仕様解説

### 増分更新と /Prev チェーンの役割（ISO 32000-1 §7.5.6）

PDF ファイルは「増分更新（incremental update）」により、既存データを書き換えずにファイル末尾へ新しいオブジェクトと xref セクションを追記できる。各 xref セクションの trailer（またはストリーム辞書）に含まれる `/Prev` エントリが、一つ前の xref セクションのバイトオフセットを示し、リンクリストを形成する。

```
+========================+
| オリジナル PDF          |
|  ヘッダ (%PDF-1.7)     |
|  ボディ (obj 1〜5)      |
|  xref (セクション A)    |  <-- offset 1000
|  trailer               |
|    << /Size 6           |
|       /Root 1 0 R >>   |
|  startxref             |
|  1000                   |
|  %%EOF                  |
+========================+
| 増分更新 #1             |
|  変更ボディ (obj 3, 6)  |
|  xref (セクション B)    |  <-- offset 2500
|  trailer               |
|    << /Size 7           |
|       /Root 1 0 R       |
|       /Prev 1000 >>    |  <-- セクション A を参照
|  startxref             |
|  2500                   |
|  %%EOF                  |
+========================+
| 増分更新 #2             |
|  変更ボディ (obj 3, 7)  |
|  xref (セクション C)    |  <-- offset 4000
|  trailer               |
|    << /Size 8           |
|       /Root 1 0 R       |
|       /Prev 2500 >>    |  <-- セクション B を参照
|  startxref             |
|  4000                   |
|  %%EOF                  |
+========================+
```

PDF リーダーは `startxref` から最新の xref セクション（セクション C）を読み取り、`/Prev` チェーンを辿って全てのセクションを収集する。

### /Prev フィールドの意味

`/Prev` はテキスト形式の trailer 辞書と xref ストリーム辞書の両方で使用される:

| 形式 | /Prev の位置 | 説明 |
|:-----|:------------|:-----|
| テキスト形式 xref | trailer 辞書 | 前の xref テーブルの `xref` キーワードのバイトオフセット |
| xref ストリーム | ストリームオブジェクトの辞書 | 前の xref セクション（テーブルまたはストリーム）のバイトオフセット |

`/Prev` が存在しない場合、そのセクションがチェーンの末端（最も古い xref セクション）となる。

### マージの概念

複数の xref セクションを統合する際、同一オブジェクト番号のエントリは**新しいセクションのものが優先**される。これにより、オブジェクトの更新・削除・圧縮への移動が反映される。

## エントリ型の上書きルール

増分更新によるオブジェクトの状態遷移パターン:

| 旧エントリ | 新エントリ | 意味 | 説明 |
|:-----------|:-----------|:-----|:-----|
| used (type=1) | free (type=0) | オブジェクト削除 | 世代番号がインクリメントされた free エントリで上書き |
| used (type=1) | compressed (type=2) | オブジェクトストリームへの移動 | 個別オブジェクトがストリーム内に再配置 |
| free (type=0) | used (type=1) | オブジェクト再利用 | 空きオブジェクト番号を再利用。世代番号がインクリメント |
| used (type=1) | used (type=1) | オブジェクト更新 | 同じオブジェクト番号で内容を差し替え |
| free (type=0) | free (type=0) | 空きチェーン更新 | 空きオブジェクトリストの再構成 |
| compressed (type=2) | used (type=1) | ストリームからの取り出し | 圧縮オブジェクトを個別オブジェクトに戻す |

マージモジュールはエントリ型の遷移を検証せず、単純に新しいエントリで上書きする。意味論的検証は上位モジュールの責務とする。

## 走査アルゴリズム

### /Prev チェーン走査フロー

```
startxref
    |
    v
+-------------------+     /Prev
| xref セクション C  | ----------+
| (最新, offset=4000)|           |
+-------------------+            v
                        +-------------------+     /Prev
                        | xref セクション B  | ----------+
                        | (offset=2500)     |           |
                        +-------------------+            v
                                               +-------------------+
                                               | xref セクション A  |
                                               | (offset=1000)     |
                                               | /Prev なし         |
                                               +-------------------+

収集順: [C, B, A] （newest-first）
マージ順: [A, B, C] （oldest-first に反転後、Map.set で上書き）
```

### 循環検出

`visited: Set<number>` で走査済みオフセットを記録する。次の `/Prev` オフセットが既に `visited` に含まれている場合、循環と判定してエラーを返す。

```typescript
const visited = new Set<number>();

while (prevOffset !== undefined) {
  if (visited.has(prevOffset)) {
    return Err({ code: "XREF_PREV_CHAIN_CYCLE", ... });
  }
  visited.add(prevOffset);
  // xref セクションを解析...
}
```

### 深度制限

`/Prev` チェーンの走査段数に上限を設ける。デフォルトは **100**。これは走査する xref セクションの最大数を意味する（最初のセクションを含む）。

深度が上限に達した場合はエラーを返す。

### `/Prev = 0` の取り扱い

`/Prev` の値が `0` の場合、これは PDF ファイルのバイトオフセット 0 を指す有効な値である（通常ありえないが仕様上は合法）。`/Prev` の存在判定は `undefined` チェックで行い、truthy チェックは使用しない:

```typescript
// 正しい判定
if (prevOffset !== undefined) {
  // /Prev が存在する → チェーン走査を継続
}

// 誤った判定（/Prev = 0 を見逃す）
if (prevOffset) {
  // /Prev = 0 の場合にスキップされてしまう
}
```

## マージアルゴリズム

### 処理フロー

1. **収集フェーズ**: `/Prev` チェーンを辿り、xref セクションを newest-first で配列に収集する
2. **反転**: 配列を reverse して oldest-first の順にする
3. **マージフェーズ**: oldest-first の順で `Map.set` を呼び、新しいエントリが古いエントリを上書きする
4. **size 決定**: 全セクションの `/Size` 値の最大値を `mergedXRef.size` とする
5. **trailer 正規化**: 最新の trailer 辞書の `/Size` を `mergedXRef.size` に正規化する

```typescript
// Step 1: 収集（newest-first）
const sections: Array<{ xref: XRefTable; trailer: TrailerDict }> = [];
// startxref → セクション C → /Prev → セクション B → /Prev → セクション A
// sections = [C, B, A]

// Step 2: 反転（oldest-first）
sections.reverse();
// sections = [A, B, C]

// Step 3: マージ
const mergedEntries = new Map<ObjectNumber, XRefEntry>();
let maxSize = 0;

for (const section of sections) {
  for (const [objNum, entry] of section.xref.entries) {
    mergedEntries.set(objNum, entry); // 後勝ち（newer overwrites older）
  }
  maxSize = Math.max(maxSize, section.xref.size);
}

// Step 4-5: 結果構築
const mergedXRef: XRefTable = { entries: mergedEntries, size: maxSize };
const latestTrailer = sections[sections.length - 1].trailer;
// latestTrailer.size を mergedXRef.size に正規化
```

### size の決定根拠

ISO 32000-1 では `/Size` は「相互参照テーブル内のオブジェクトの最大番号 + 1」と定義される。増分更新でオブジェクトが追加されると `/Size` は増加するが、減少することはない。全セクションの `/Size` の最大値を取ることで、ファイル全体で参照可能な全オブジェクトをカバーする。

## エラーケース

すべてのエラーは `throw` せず `Result` 型（`Err<PdfParseError>`）で返す。

| ID | エラーコード | 条件 | 説明 |
|:---|:------------|:-----|:-----|
| E-001 | `XREF_PREV_CHAIN_CYCLE` | `/Prev` が既に走査済みのオフセットを指す | 循環を検出。`visited` Set で判定 |
| E-002 | `XREF_PREV_CHAIN_TOO_DEEP` | `/Prev` チェーンの走査段数が深度制限（デフォルト 100）を超過 | 異常な深さのチェーンを防止 |
| E-003 | パーサーエラーのパススルー | 各 xref セクションの解析中にエラーが発生 | `parseXRefTable` や `decodeXRefStreamEntries` が返すエラーをそのまま伝搬 |

```typescript
// エラーオブジェクトの例（message 文言は一例であり、実装と完全一致することを保証しない）
{ code: "XREF_PREV_CHAIN_CYCLE", message: "/Prev chain cycle detected at offset 1000" }
{ code: "XREF_PREV_CHAIN_TOO_DEEP", message: "/Prev chain depth exceeded limit of 100" }
```

## 形式混在（XM-004）

PDF ファイルでは、増分更新ごとにテキスト形式の xref テーブルと xref ストリームが混在することがある。例えば:

- オリジナル PDF: テキスト形式 xref テーブル
- 増分更新 #1: xref ストリーム（PDF 1.5+ ライタによる更新）

`mergeXRefChain` はコールバック方式を採用しており、形式の自動判定は **コールバック提供側（呼び出し元）の責務** である。Merger 自体はオフセットを渡してコールバックを呼ぶだけで、テキスト形式かストリーム形式かを区別しない。

呼び出し元が形式を判定する典型的な方法:

```
offset の先頭バイト列を検査:
  "xref" → parseXRefTable を使用
  "N N obj" パターン → parseXRefStream を使用（ストリームオブジェクト）
```

判定ロジック（コールバック実装側で行う）:

| 先頭パターン | 形式 | 呼び出すパーサー |
|:------------|:-----|:----------------|
| `xref` キーワード | テキスト形式 | `parseXRefTable` + `parseTrailer` |
| 間接オブジェクト定義（`N N obj`） | xref ストリーム | `parseXRefStream`（辞書に trailer 統合） |

これにより、`/Prev` チェーン内でテキスト形式とストリーム形式が交互に出現する PDF でも正しくマージできる。

## 具体例

### 例 1: 増分更新 1 回の PDF

オリジナル PDF にオブジェクト 3 の更新とオブジェクト 6 の追加を含む増分更新が1回行われた場合:

**セクション A（オリジナル, offset=1000）**:
```
xref
0 6
0000000000 65535 f     ← obj 0: free (チェーン先頭)
0000000009 00000 n     ← obj 1: used, offset=9
0000000074 00000 n     ← obj 2: used, offset=74
0000000120 00000 n     ← obj 3: used, offset=120
0000000179 00000 n     ← obj 4: used, offset=179
0000000322 00000 n     ← obj 5: used, offset=322
trailer
<< /Size 6 /Root 1 0 R >>
```

**セクション B（増分更新 #1, offset=2500）**:
```
xref
3 1
0000000500 00000 n     ← obj 3: used, offset=500（更新）
6 1
0000000600 00000 n     ← obj 6: used, offset=600（新規追加）
trailer
<< /Size 7 /Root 1 0 R /Prev 1000 >>
```

**マージ手順**:

1. `startxref` = 2500 → セクション B を解析
2. `/Prev` = 1000 → セクション A を解析
3. `/Prev` なし → 走査終了
4. 収集: `[B, A]` → 反転: `[A, B]`
5. マージ:
   - A の全エントリを Map に追加: obj 0〜5
   - B のエントリで上書き: obj 3（offset=120 → 500）, obj 6（新規）
6. `size = max(6, 7) = 7`

**マージ結果**:
```
entries:
  obj 0: free, nextFree=0, gen=65535   ← A から
  obj 1: used, offset=9, gen=0        ← A から
  obj 2: used, offset=74, gen=0       ← A から
  obj 3: used, offset=500, gen=0      ← B で上書き
  obj 4: used, offset=179, gen=0      ← A から
  obj 5: used, offset=322, gen=0      ← A から
  obj 6: used, offset=600, gen=0      ← B で追加
size: 7
```

### 例 2: 3 段チェーンのマージ

3 回の増分更新があり、以下の変更が加えられた場合:

| セクション | offset | /Prev | /Size | 変更内容 |
|:-----------|:-------|:------|:------|:---------|
| A（オリジナル） | 1000 | なし | 5 | obj 0〜4 を定義 |
| B（更新 #1） | 2500 | 1000 | 6 | obj 2 を更新、obj 5 を追加 |
| C（更新 #2） | 4000 | 2500 | 6 | obj 2 を削除（free化）、obj 3 を更新 |

**走査**:

```
startxref = 4000
  → セクション C 解析 (offset=4000)
    /Prev = 2500
      → セクション B 解析 (offset=2500)
        /Prev = 1000
          → セクション A 解析 (offset=1000)
            /Prev なし → 走査終了
```

**収集**: `[C, B, A]`
**反転**: `[A, B, C]`

**マージ（oldest-first で Map.set）**:

| ステップ | セクション | 操作 | Map の状態（obj 2 に注目） |
|:---------|:-----------|:-----|:--------------------------|
| 1 | A | obj 0〜4 を追加 | obj 2: used, offset=74 |
| 2 | B | obj 2, 5 を上書き/追加 | obj 2: used, offset=300（B で更新） |
| 3 | C | obj 2, 3 を上書き | obj 2: free, gen=1（C で削除） |

**最終結果**:
```
entries:
  obj 0: free, nextFree=0, gen=65535   ← A
  obj 1: used, offset=9, gen=0        ← A
  obj 2: free, nextFree=0, gen=1      ← C で削除（B の更新を上書き）
  obj 3: used, offset=450, gen=0      ← C で更新
  obj 4: used, offset=179, gen=0      ← A
  obj 5: used, offset=350, gen=0      ← B で追加
size: max(5, 6, 6) = 6
```

この例で obj 2 は A → B → C と 3 回の変更を受けるが、マージ結果には最新のセクション C のエントリのみが残る。
