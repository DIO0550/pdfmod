# Fallback xref スキャナ（object-scanner）

PDF ファイル全体のバイト列を 1 パスで走査し、`\d+ \d+ obj` 形式のオブジェクトヘッダ位置を検出するモジュール。
xref テーブル / xref ストリームが欠損・破損していて使えないときに、Body セクションを直接スキャンして xref を再構築するために使う。

実装: `packages/core/src/xref/fallback/object-scanner.ts`
公開 API: `scanObjectHeaders(data: Uint8Array): ObjectScanReport`

---

## どの PDF 仕様に基づくか

参照: ISO 32000-1:2008（PDF 1.7）/ ISO 32000-2:2020（PDF 2.0）

| 項目 | 該当節 |
|:-|:-|
| Indirect object の構文 | §7.3.10 Indirect Objects |
| 字句規則（white-space / delimiter / regular character） | §7.2.3 Character Set |
| コメント（`%` から行末まで） | §7.2.4 Comments |
| Cross-reference table の構造 | §7.5.4 Cross-Reference Table |
| Cross-reference stream | §7.5.8 Cross-Reference Streams |
| 破損 PDF の扱い | §7.5.4「実装は壊れた xref を許容して回復してよい」(implementation note) |

このスキャナは **§7.3.10 で定義される indirect object のヘッダ部分** だけを検出する。
ボディ（`<<...>>` や stream）や `endobj` の検出は別モジュールの責務。

---

## §7.3.10 Indirect Objects — スキャン対象の構文

PDF の indirect object は次の構文で定義される（§7.3.10）:

```
<object number> <generation number> obj
  ⟨object content⟩
endobj
```

- **object number** … 1 以上の正の整数
- **generation number** … 0 以上 65535 以下の非負整数
- **obj / endobj** … キーワード（リテラル文字列）
- 各トークンは **white-space で区切られる** (§7.2.3)

このスキャナが拾うのはヘッダ部分 `<object number> <generation number> obj` の **先頭バイト位置** と **両数値**。

### 例

```
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
```

→ `{ objectNumber: 1, generation: 0, offset: 0 }` を返す。

---

## §7.2.3 Character Set — トークン境界

§7.2.3 は PDF の文字集合を 3 種類に分類する:

| 区分 | バイト |
|:-|:-|
| white-space | NUL (0x00), HT (0x09), LF (0x0A), FF (0x0C), CR (0x0D), SP (0x20) |
| delimiter | `( ) < > [ ] { } / %` |
| regular | 上記以外の印字可能文字 |

このスキャナは「`obj` キーワードの直前直後」「`obj number`・`generation` の前」が **white-space または delimiter（= regular でない）** であることを確認する。
これにより `object reference` のような部分一致や `OBJX` のような語境界違反を弾く。

実装上は `lexer/bytes/index.ts` の `isPdfWhitespace` / `isPdfTokenBoundary` を使う。

---

## §7.2.4 Comments — コメント領域の除外

§7.2.4: コメントは `%` (0x25) で始まり、次の EOL (LF / CR / CRLF) までが範囲。
**コメントは syntactically a single white-space character と等価に扱う**（仕様の原文ママ）。

スキャナはこの仕様を 2 箇所で使う:

1. **コメント行内の `1 0 obj` を hit にしない**
   メインループの `inComment` フラグで `%` から行末までを丸ごと除外。

2. **数字とキーワードの間にコメントが挟まる場合も white-space と同じく飛ばす**
   例: `1 0%comment\nobj` も valid な header として認識する。
   `findPreviousNonWhitespaceByte` がコメント領域を逆方向に飛び越える。

§7.2.4 が「コメントは white-space 1 つと等価」と定義しているので、両方とも仕様通りの挙動。

---

## §7.5.4 Cross-Reference Table — なぜ fallback が必要か

通常の PDF では、ファイル末尾の `startxref` が指す位置に xref テーブル（または xref ストリーム）があり、各オブジェクトのバイトオフセットが記録されている:

```
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000074 00000 n
0000000120 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
178
%%EOF
```

しかし以下のケースでは xref が信頼できない:

- ファイル転送中のバイナリ汚染（CR/LF 変換）でオフセットがずれた
- 編集ツールが xref を更新せずに body だけ書き換えた（incremental update のミス）
- ファイルが途中で truncate された
- `%%EOF` や `startxref` が見つからない

このとき **PDF spec §7.5.4 Implementation note は「コンフォーマント・リーダーは破損した xref を寛容に扱ってもよい」と述べている**。
実装としては body をスキャンして全 indirect object の位置を実測し、xref を再構成する。これが fallback xref scanner。

このモジュールはその第 1 段階「body 全体から `\d+ \d+ obj` ヘッダの位置を網羅的に列挙する」を担当する。

---

## オブジェクト番号・世代番号の検証

§7.3.10 と §7.5.4 から制約が決まる:

| 値 | 制約 | 仕様根拠 |
|:-|:-|:-|
| object number | 1 以上の正の整数（safe integer 範囲） | §7.3.10 |
| generation number | 0 以上 65535 以下 | §7.5.4 / §7.3.10 |

このスキャナでは:

- **数字列が読めない**（safe integer overflow）→ skipped に `"object-number-invalid"` で記録
- **`ObjectNumber.create` が Err**（負・0・非整数等）→ skipped
- **`GenerationNumber.create` が Err**（範囲外）→ skipped に `"generation-invalid"` で記録

skipped は呼び出し側（fallback-scanner）で `XREF_REBUILD` warning の `recovery` 情報に集約される。
完全に構造として成立しないもの（`obj` キーワードに一致しない、トークン境界が無い、数字列がそもそも無い）は記録せず捨てる。

---

## 出力形式

```ts
interface ObjectHit {
  readonly objectNumber: ObjectNumber;       // 1 以上の brand 型
  readonly generation: GenerationNumber;     // 0..65535 の brand 型
  readonly offset: ByteOffset;               // ヘッダ先頭（最初の数字）のバイト位置
}

interface ObjectScanSkipped {
  readonly offset: ByteOffset;
  readonly reason: "object-number-invalid" | "generation-invalid";
}

interface ObjectScanReport {
  readonly hits: readonly ObjectHit[];
  readonly skipped: readonly ObjectScanSkipped[];
}
```

`hits` はバイトオフセット昇順で並ぶ（メインループが先頭から走査するため）。

---

## 計算量

入力長 `N` に対して **O(N)**。
コメント領域の除外は走査ループ内の状態フラグで行うため、`obj` キーワード候補ごとの per-position コメント判定は不要。
逆方向の数字列読み取り (`readObjectHeader`) は各 `obj` 候補に対してのみ走り、数字列の長さは実用上 1 桁〜10 桁程度なので無視できる。

---

## 関連ドキュメント

- [`lexer.md`](./lexer.md) — 字句解析全体の設計
- [`specs/02_file_structure.md`](./specs/02_file_structure.md) — PDF ファイル構造（xref 含む）
- [`specs/02a_object_resolution.md`](./specs/02a_object_resolution.md) — オブジェクト解決
