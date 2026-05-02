# PdfDocument.load の fallback recovery 経路

> **機能**: [PDF解析パイプライン](./index.md)
> **関連 spec**: ISO 32000-1:2008 §7.5 (File Structure)
> **実装**: `packages/core/src/document/pdf-document.ts`
> **ステータス**: 下書き (spec-013 PR-12 で実装)

## 概要

`PdfDocument.load` は ヘッダ検証 → startxref 走査 → xref/trailer 解析 → ObjectStore 生成 → カタログ解析 → ページツリー走査 → /Info メタデータ抽出 を直列に実行する。
本ドキュメントは、その中の **xref/trailer 解析段階で正規パスが破綻したときの fallback recovery** を対象とする。

正規パスは ISO 32000-1 §7.5.5 の `startxref` → `xref` → `trailer` → `/Root` チェーン。fallback はこの構造が破損している PDF を可能な限り読み込むための recovery 層で、Acrobat 等の reader が現実世界の壊れた PDF に対して暗黙に行う「本文の `obj` ヘッダを線形走査して xref を再構築する」挙動を、`onWarning` 契約で明示的に表現する。

## 解決経路

`resolveXRefStructure(data, emitWarnings)` ローカル関数が xref と trailer を 1 つの「xref 構造」として解決する。

```
scanStartXRef(data)
├─ Err  → scanFallback ─┬─ trailer.Some → emitWarnings(XREF_REBUILD) → Ok({xref, trailer})
│                       └─ trailer.None → Err({code: "ROOT_NOT_FOUND"})  (§7.5.5 必須エントリ違反)
└─ Ok   → mergeXRefChain
          ├─ Ok   → Ok({xref: mergedXRef, trailer: latestTrailer})
          └─ Err  → scanFallback ─┬─ trailer.Some → emitWarnings(XREF_REBUILD) → Ok({xref, trailer})
                                  └─ trailer.None → 元の mergeResult Err を伝搬
```

### fallback 発火条件

ISO 32000-1 §7.5.5 に基づく正規パスの破綻 2 種類でのみ発火する:

| トリガー | 仕様上の意味 | 典型例 |
|:---|:---|:---|
| `scanStartXRef` Err | `%%EOF` 直前の `startxref <offset>` が見つからない or 不正 (§7.5.5) | ヘッダのみで本体無し / ファイル末尾切り捨て |
| `mergeXRefChain` Err | xref テーブル / trailer 辞書が malformed、`/Prev` cycle、`/Root` 必須エントリ欠落 (§7.5.4 / §7.5.5) | xref offset が壊れている / `/Prev` の循環参照 / trailer 辞書から `/Root` が欠落 |

`CatalogParser` (§7.7.2) / `PageTreeWalker` (§7.7.3) / `DocumentInfoParser` (§14.3.3) の Err では fallback **しない**。これらは xref 構造が正しく解決された後の論理的なエラーで、recovery しても結果は変わらない。

### scanFallback の詳細

`packages/core/src/xref/fallback/` 配下。詳細は [xref-fallback-scanner.md](../xref-fallback-scanner.md) 参照。本ドキュメントでは `PdfDocument.load` から見た契約のみ記す。

- 戻り値型: `Result<FallbackScanResult, PdfError>`。現状実装は常に `Ok` を返すが、将来拡張に備えて `if (!fb.ok) return fb;` で Err 伝搬経路を温存している。
- `FallbackScanResult.xrefTable`: 線形走査で集めた `N G obj` ヘッダから合成した xref (`type=n` のみ)
- `FallbackScanResult.trailer`: `Option<TrailerDict>`
  - 末尾近くに valid な `trailer << ... >>` ブロックがあれば直接利用
  - 無ければ本体の `/Type /Catalog` を含む dict object を最末尾優先で探し、最小 trailer (`/Root`, `/Size`) を合成 (§7.5.5 必須エントリ)
  - どちらも見つからなければ `None`
- `FallbackScanResult.warnings`: `XREF_REBUILD` 1 件 (skip 件数 / 理由カテゴリは `recovery` に集約)

## warning 契約 (`XREF_REBUILD`)

`onWarning` は ISO 32000-1 仕様にない本ライブラリ拡張の「回復可能な警告」通知点。fallback を通過した場合、`PdfDocument.load` は xref/trailer の再構築が行われたことを `XREF_REBUILD` warning で呼び出し側に通知する。

### 発火タイミング

```
scanFallback Ok
├─ trailer.Some  → emitWarnings(XREF_REBUILD) を発火してから ROOT 解決へ進む
└─ trailer.None  → emitWarnings は呼ばない (load は失敗を返すため、recovery 通知は契約違反)
```

`trailer.None` で warning を発火しないのは、warning が「**復元成功** + 注意してね」を意味する契約だから。`load()` が `Err` を返すケースで recovery warning を出すと、呼び出し側は「復元できた」と誤解する。

### emitWarnings ローカル関数

`load()` 内クロージャで定義し、`options?.onWarning` をラップ。同じ関数を 3 箇所から呼ぶ:

| 呼び出し元 | 仕様上の対応箇所 | 通知内容 |
|:---|:---|:---|
| `resolveXRefStructure` の fallback 経路 | §7.5.4 / §7.5.5 違反からの復元 | `XREF_REBUILD` (1 件) |
| `PageTreeWalker.walk` 後 | §7.7.3 ページ木走査時の異常 | walk 内で蓄積された warnings |
| `DocumentInfoParser.parse` 後 | §14.3.3 Document Information Dictionary 解析時の異常 | parse 内で蓄積された warnings |

`options?.onWarning` 未登録なら早期 return で配列イテレーションを省略する。

```ts
type EmitWarnings = (warnings: readonly PdfWarning[]) => void;

const emitWarnings: EmitWarnings = (warnings) => {
  if (!options?.onWarning) return;
  for (const w of warnings) options.onWarning(w);
};
```

汎用 callback util にはせず、`load` ローカルにスコープして caller ローカル原則を満たす形にしている。

## エラー契約

| 経路 | 戻り値 | 意味 |
|:---|:---|:---|
| scanStartXRef Err → fallback Ok / trailer Some | `Ok` + `XREF_REBUILD` warning | degraded recovery 成功 |
| scanStartXRef Err → fallback Ok / trailer None | `Err({code:"ROOT_NOT_FOUND", message:"fallback xref scan could not reconstruct trailer", offset:0})` | ヘッダのみで本体無し等の確定パス (L-002) |
| scanStartXRef Ok → mergeXRefChain Ok | `Ok` (warning なし) | 正規パス成功 |
| scanStartXRef Ok → mergeXRefChain Err → fallback Ok / trailer Some | `Ok` + `XREF_REBUILD` warning | degraded recovery 成功 |
| scanStartXRef Ok → mergeXRefChain Err → fallback Ok / trailer None | **元の mergeResult Err をそのまま伝搬** | 真の失敗原因 (CIRCULAR_REFERENCE / 不正 xref 等) を温存 |
| scanFallback Err (将来) | scanFallback の Err をそのまま伝搬 | scanFallback 自体の失敗 |

merge-failure 経路で trailer 復元できなかった時に合成 `ROOT_NOT_FOUND` を被せると、CIRCULAR_REFERENCE などの根本原因が消えて caller を混乱させるため、元の Err を温存する仕様にしている。一方 `scanStartXRef` Err 経路では「そもそも xref に到達できない」という意味で `ROOT_NOT_FOUND` を返すのが妥当 (spec hearing-notes §4 で確定)。

## 仕様との乖離 (既知制約)

`scanFallback` は `obj` ヘッダから xref を再構築する都合で、ISO 32000-1 §7.5 の意味論を完全には再現できない:

| 仕様 | fallback での扱い |
|:---|:---|
| §7.5.4 `type=f` 自由エントリ (削除済みオブジェクト) | **再現不能**。`obj` ヘッダしか見ないため、incremental update で削除されたオブジェクトが fallback 経由では「生き返る」ことがある |
| §7.5.6 `/Prev` 連鎖 (新 revision で旧エントリ上書き) | **再現不能**。最新 revision を線形スキャンで合成するのみ |
| §7.5.8 圧縮オブジェクト (xref stream) | scanFallback 自体は対応するが、xref/fallback layer のスコープ |

これらは degraded recovery の trade-off として設計上受け入れている。`XREF_REBUILD` warning が出ているときは「復元はできたが上記の制約があり得る」状態として呼び出し側で扱う。仕様準拠が必要な caller は warning を error として扱えばよい。

## 関連ドキュメント

- [xref-fallback-scanner.md](../xref-fallback-scanner.md) — `scanFallback` 実装の詳細
- [xref-merger-spec.md](./xref-merger-spec.md) — `mergeXRefChain` (`/Prev` 連鎖マージ) の仕様
- [startxref-scanner.md](./startxref-scanner.md) — `scanStartXRef` の仕様
- [xref-parser-spec.md](./xref-parser-spec.md) — xref テーブル解析
- [error-handling-spec.md](./error-handling-spec.md) — `PdfError` / `PdfWarning` 階層
