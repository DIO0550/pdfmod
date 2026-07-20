/**
 * xref ストリーム自身の stream 辞書 `/Length` が間接参照の場合の
 * ブートストラップ的な解決 resolver（ISO 32000-1 §7.5.8）。
 *
 * xref テーブルがまだ構築されていない段階のため、通常の ObjectStore 経由の
 * resolver（`readInlineEntry` 等）は使えない。`scanObjectHeaders`
 * （xref/fallback/object-scanner）を再利用し、対象 objectNumber/generationNumber に
 * 一致する `N G obj` ヘッダをファイル全体から検索する。複数ヒット時は
 * 最後に見つかった値（末尾優先）を採用する（`rebuildXRefTable` と同じ規則）。
 *
 * @module
 */

import type { ObjectResolver } from "../../../../objects/object-parser/index";
import { ObjectParser } from "../../../../objects/object-parser/index";
import type { PdfError } from "../../../../pdf/errors/index";
import type { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import type { ObjectNumber } from "../../../../pdf/types/object-number/index";
import type { PdfObject } from "../../../../pdf/types/pdf-types/index";
import type { Result } from "../../../../utils/result/index";
import { err, ok } from "../../../../utils/result/index";
import {
  type ObjectHit,
  type ObjectScanReport,
  scanObjectHeaders,
} from "../../../fallback/object-scanner/index";

/**
 * `scanObjectHeaders` の結果を `data` ごとにキャッシュする。
 * `/Prev` チェーンに間接 `/Length` を持つ xref ストリームが複数含まれる場合、
 * セクションごとに新しい resolver が生成されるが、走査対象の `data`
 * （PDFファイル全体）は同一インスタンスのまま渡ってくるため、
 * 同一 `data` に対する再走査（O(N)のファイル全体走査）を避ける。
 */
const scanReportCache = new WeakMap<Uint8Array, ObjectScanReport>();

/**
 * `scanReportCache` を介した `scanObjectHeaders` の呼び出し。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns `scanObjectHeaders(data)` の結果（キャッシュ済みならそれを再利用）
 */
function scanObjectHeadersCached(data: Uint8Array): ObjectScanReport {
  const cached = scanReportCache.get(data);
  if (cached !== undefined) {
    return cached;
  }
  const report = scanObjectHeaders(data);
  scanReportCache.set(data, report);
  return report;
}

/**
 * `hits` から objectNumber/generationNumber に一致する ObjectHit をすべて、
 * 出現順（ファイル先頭→末尾）のまま返す。呼び出し側で末尾から検証する。
 *
 * @param hits - scanObjectHeaders の走査結果
 * @param objectNumber - 検索対象のオブジェクト番号
 * @param generationNumber - 検索対象の世代番号
 * @returns 一致した ObjectHit の配列（出現順）
 */
function findMatchingHits(
  hits: readonly ObjectHit[],
  objectNumber: ObjectNumber,
  generationNumber: GenerationNumber,
): ObjectHit[] {
  return hits.filter(
    (hit) =>
      hit.objectNumber === objectNumber && hit.generation === generationNumber,
  );
}

/**
 * xref ストリームの stream 辞書 `/Length` が間接参照の場合に使う
 * ブートストラップ resolver を構築する。`ObjectResolver` 型互換のコールバックを返す。
 *
 * `scanObjectHeaders` は stream データ（バイナリ本文）内も無差別にバイト走査するため、
 * 偶発的に `N G obj` に見えるバイト列が実オブジェクトより後ろに出現する可能性がある。
 * 「末尾優先」は維持しつつ、末尾候補が `parseIndirectObject` の構文解析または
 * ヘッダ整合性検証に失敗した場合は、より前に出現した候補へ1件ずつフォールバックする
 * （全候補が尽きたら Err）。正当な PDF（一致が1件のみ、またはインクリメンタル更新による
 * 正当な重複）では従来どおり最後の候補がそのまま採用されるため挙動は変わらない。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns `ObjectParser.parseIndirectObject` の `resolver` 引数に渡せるコールバック
 */
export function createBootstrapLengthResolver(
  data: Uint8Array,
): ObjectResolver {
  return async (
    objectNumber: ObjectNumber,
    generationNumber: GenerationNumber,
  ): Promise<Result<PdfObject, PdfError>> => {
    const report = scanObjectHeadersCached(data);
    const candidates = findMatchingHits(
      report.hits,
      objectNumber,
      generationNumber,
    );
    if (candidates.length === 0) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `bootstrap /Length resolution failed: object ${objectNumber} ${generationNumber} not found by header scan`,
      });
    }

    let lastError: PdfError = {
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `bootstrap /Length resolution failed: no candidate for object ${objectNumber} ${generationNumber} validated`,
    };
    for (let i = candidates.length - 1; i >= 0; i--) {
      const hit = candidates[i];
      const parsed = await ObjectParser.parseIndirectObject(data, hit.offset);
      if (!parsed.ok) {
        lastError = parsed.error;
        continue;
      }
      if (
        parsed.value.objectNumber !== objectNumber ||
        parsed.value.generationNumber !== generationNumber
      ) {
        lastError = {
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `bootstrap /Length resolution failed: obj header mismatch at offset ${String(hit.offset)} (expected ${objectNumber} ${generationNumber}, got ${parsed.value.objectNumber} ${parsed.value.generationNumber})`,
          offset: hit.offset,
        };
        continue;
      }
      return ok(parsed.value.body);
    }

    return err(lastError);
  };
}
