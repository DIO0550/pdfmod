/**
 * `PdfDocument.load` がクロスリファレンスストリーム（`/Type /XRef`）経由でも読み込めることを
 * 検証するテスト向けの PDF バイト列ビルダー群。`/Filter` を持たない生（非圧縮）の
 * xref ストリームを用いることで、zlib 圧縮バイト列を事前計算せずオフセットを動的に組み立てられる。
 */

const HEADER = "%PDF-1.7\n";
const CATALOG_BODY = "<< /Type /Catalog /Pages 2 0 R >>";
const PAGES_BODY = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const PAGE_BODY = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>";

const encoder = new TextEncoder();

const BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;
const MAX_UINT16 = 0xffff;
const MAX_UINT8 = 0xff;
const XREF_ENTRY_TYPE_USED = 1;
const XREF_ENTRY_TYPE_COMPRESSED = 2;
const OFFSET_PAD_DIGITS = 10;
const OFFSET_PAD_RADIX = 10;

/**
 * 文字列をバイト長として測る。
 *
 * @param s - 対象文字列
 * @returns UTF-8 バイト長
 */
const byteLen = (s: string): number => encoder.encode(s).length;

/**
 * 値が `[0, max]` の整数範囲に収まるか検証し、範囲外なら即座に throw する。
 * W=[1,2,1] のビット幅に収まらない値をビット演算で暗黙に切り詰めると、
 * 壊れた（しかし気づきにくい）xref ストリームフィクスチャを生成してしまうため、
 * テスト作成時のミスを早期に検出する目的のガード。
 *
 * @param value - 検証対象の値
 * @param max - 許容最大値
 * @param label - エラーメッセージに含める値の名称
 * @throws {Error} value が整数でない、または `[0, max]` の範囲外の場合
 */
const assertFitsInRange = (value: number, max: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be an integer in [0, ${max}], got ${value}`);
  }
};

/**
 * W=[1,2,1] 前提で xref ストリームの type=1（使用中）エントリ4バイトを組み立てる。
 *
 * @param offset - ファイル内バイトオフセット（2バイトBEで表現可能な範囲、0-65535）
 * @returns 4バイトのエントリ配列
 */
const usedEntryBytes = (offset: number): number[] => {
  assertFitsInRange(offset, MAX_UINT16, "offset");
  return [
    XREF_ENTRY_TYPE_USED,
    (offset >> BYTE_SHIFT) & BYTE_MASK,
    offset & BYTE_MASK,
    0,
  ];
};

/**
 * W=[1,2,1] 前提で xref ストリームの type=2（ObjStm内圧縮）エントリ4バイトを組み立てる。
 *
 * @param streamObjectNumber - 親 ObjStm のオブジェクト番号（2バイトBEで表現可能な範囲、0-65535）
 * @param indexInStream - ObjStm 内インデックス（1バイトで表現可能な範囲、0-255）
 * @returns 4バイトのエントリ配列
 */
const compressedEntryBytes = (
  streamObjectNumber: number,
  indexInStream: number,
): number[] => {
  assertFitsInRange(streamObjectNumber, MAX_UINT16, "streamObjectNumber");
  assertFitsInRange(indexInStream, MAX_UINT8, "indexInStream");
  return [
    XREF_ENTRY_TYPE_COMPRESSED,
    (streamObjectNumber >> BYTE_SHIFT) & BYTE_MASK,
    streamObjectNumber & BYTE_MASK,
    indexInStream,
  ];
};

/** W=[1,2,1] 前提で xref ストリームの type=0（フリー）エントリ4バイト。 */
const FREE_ENTRY_BYTES: readonly number[] = [0, 0, 0, 0];

/**
 * テキスト形式 xref エントリの10桁ゼロ埋めオフセット文字列を組み立てる。
 *
 * @param n - 0 以上の整数オフセット値
 * @returns 10桁ゼロ埋め文字列
 */
const pad10 = (n: number): string =>
  n.toString(OFFSET_PAD_RADIX).padStart(OFFSET_PAD_DIGITS, "0");

/**
 * バイト配列群を連結する。
 *
 * @param chunks - 連結対象のバイト配列群
 * @returns 連結済みバイト配列
 */
const concatBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

/**
 * 1ページのみを持つ最小構成の PDF を、クロスリファレンスストリーム
 * （`/Type /XRef`, `/Filter` なしの生データ）を唯一の xref 構造として生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj) / Page (3 0 obj) はテキスト形式のまま、
 * xref のみストリーム形式（4 0 obj、自己無矛盾な offset を含む）にする。
 *
 * @returns xref ストリームのみを持つ 1 ページ PDF のバイト列
 */
export const buildSinglePagePdfWithXRefStream = (): Uint8Array => {
  const bodies = [CATALOG_BODY, PAGES_BODY, PAGE_BODY];
  const objs = bodies.map((body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`);

  const offsets: number[] = [];
  let cursor = byteLen(HEADER);
  for (const obj of objs) {
    offsets.push(cursor);
    cursor += byteLen(obj);
  }
  const xrefOffset = cursor;

  const rawEntries = new Uint8Array([
    ...FREE_ENTRY_BYTES,
    ...usedEntryBytes(offsets[0]),
    ...usedEntryBytes(offsets[1]),
    ...usedEntryBytes(offsets[2]),
    ...usedEntryBytes(xrefOffset),
  ]);

  const xrefObj =
    "4 0 obj\n" +
    `<< /Type /XRef /W [1 2 1] /Size 5 /Root 1 0 R /Length ${rawEntries.length} >>\n` +
    "stream\n";
  const footer = `startxref\n${xrefOffset}\n%%EOF\n`;

  return concatBytes([
    encoder.encode(HEADER),
    encoder.encode(objs.join("")),
    encoder.encode(xrefObj),
    rawEntries,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode(footer),
  ]);
};

const OLD_SIZE = 4;
const NEW_SECTION_FIRST_OBJ_NUM = 4;
const NEW_PAGE_WIDTH = 200;
const NEW_PAGE_HEIGHT = 300;
const NEW_PAGE_MEDIA_BOX: readonly [number, number, number, number] = [
  0,
  0,
  NEW_PAGE_WIDTH,
  NEW_PAGE_HEIGHT,
];

/**
 * 旧revision（テキスト xref）→ 新revision（クロスリファレンスストリーム、`/Prev` で旧を参照）の
 * インクリメンタルアップデート PDF を生成する。
 *
 * 旧: Catalog (1 0 R) / Pages (2 0 R) / Page (3 0 R, MediaBox [0 0 612 792])、テキスト xref。
 * 新: Catalog (4 0 R) / Pages (5 0 R) / Page (6 0 R, MediaBox {@link NEW_PAGE_MEDIA_BOX}) と、
 * それ自身を含む xref ストリーム (7 0 obj, `/Prev` で旧 xref オフセットを参照)。
 *
 * `mergeXRefChain` が新（ストリーム）→ 旧（テキスト）の順に `/Prev` を辿り、
 * 最新 trailer の `/Root`（新 Catalog）経由でページ構造が観測されることを検証する。
 *
 * @returns テキスト xref → xref ストリームの /Prev チェーンを持つ PDF バイト列
 */
export const buildPdfWithIncrementalUpdateViaXRefStream = (): Uint8Array => {
  const oldObjs = [CATALOG_BODY, PAGES_BODY, PAGE_BODY].map(
    (body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`,
  );

  const oldOffsets: number[] = [];
  let cursor = byteLen(HEADER);
  for (const obj of oldObjs) {
    oldOffsets.push(cursor);
    cursor += byteLen(obj);
  }
  const oldXrefOffset = cursor;

  const oldXrefRows = [
    "0000000000 65535 f \n",
    ...oldOffsets.map((o) => `${pad10(o)} 00000 n \n`),
  ];
  const oldXref = `xref\n0 ${OLD_SIZE}\n${oldXrefRows.join("")}`;
  const oldTrailer = `trailer\n<< /Size ${OLD_SIZE} /Root 1 0 R >>\nstartxref\n${oldXrefOffset}\n%%EOF\n`;
  const oldTail = oldXref + oldTrailer;
  cursor += byteLen(oldTail);

  const [mbX, mbY, mbW, mbH] = NEW_PAGE_MEDIA_BOX;
  const newBodies = [
    "<< /Type /Catalog /Pages 5 0 R >>",
    "<< /Type /Pages /Kids [6 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 5 0 R /MediaBox [${mbX} ${mbY} ${mbW} ${mbH}] >>`,
  ];
  const newObjs = newBodies.map(
    (body, i) => `${i + NEW_SECTION_FIRST_OBJ_NUM} 0 obj\n${body}\nendobj\n`,
  );

  const newOffsets: number[] = [];
  for (const obj of newObjs) {
    newOffsets.push(cursor);
    cursor += byteLen(obj);
  }
  const newXrefOffset = cursor;

  const rawEntries = new Uint8Array([
    ...FREE_ENTRY_BYTES,
    ...usedEntryBytes(newOffsets[0]),
    ...usedEntryBytes(newOffsets[1]),
    ...usedEntryBytes(newOffsets[2]),
    ...usedEntryBytes(newXrefOffset),
  ]);

  const newXrefObj =
    "7 0 obj\n" +
    "<< /Type /XRef /W [1 2 1] /Size 8 /Index [0 1 4 4] " +
    `/Root 4 0 R /Prev ${oldXrefOffset} /Length ${rawEntries.length} >>\n` +
    "stream\n";
  const footer = `startxref\n${newXrefOffset}\n%%EOF\n`;

  return concatBytes([
    encoder.encode(HEADER),
    encoder.encode(oldObjs.join("")),
    encoder.encode(oldTail),
    encoder.encode(newObjs.join("")),
    encoder.encode(newXrefObj),
    rawEntries,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode(footer),
  ]);
};

/**
 * クロスリファレンスストリーム（type=2 エントリ）経由でのみ到達可能な、
 * ObjStm（オブジェクトストリーム）内に Catalog/Pages/Page を格納した PDF を生成する。
 *
 * オブジェクト構成: 2 0 obj = ObjStm（`/Filter` なしの生データ、Catalog/Pages/Page を格納）、
 * 1 0 obj = xref ストリーム自身（type=1 自己参照 + ObjStm への type=1 参照 +
 * Catalog/Pages/Page への type=2 参照）。
 *
 * `PdfDocument.load` が xref ストリームの type=2 エントリ → `ObjectStore` の
 * ObjStm 解決パイプライン（`object-stream-extractor`）まで到達することを検証する。
 *
 * @returns ObjStm 経由の PDF バイト列
 */
export const buildPdfWithXRefStreamAndObjStm = (): Uint8Array => {
  const objStmEntries = [
    { objNum: 3, body: CATALOG_BODY.replace("2 0 R", "4 0 R") },
    { objNum: 4, body: PAGES_BODY.replace("3 0 R", "5 0 R") },
    { objNum: 5, body: PAGE_BODY.replace("2 0 R", "4 0 R") },
  ];

  let bodyCursor = 0;
  const relOffsets: number[] = [];
  for (const e of objStmEntries) {
    relOffsets.push(bodyCursor);
    bodyCursor += byteLen(e.body) + 1;
  }
  const headerStr = `${objStmEntries
    .map((e, i) => `${e.objNum} ${relOffsets[i]}`)
    .join(" ")} `;
  const bodyStr = objStmEntries.map((e) => `${e.body} `).join("");
  const objStmData = encoder.encode(headerStr + bodyStr);
  const first = byteLen(headerStr);

  let cursor = byteLen(HEADER);
  const objStmObjOffset = cursor;
  const objStmObj =
    "2 0 obj\n" +
    `<< /Type /ObjStm /N ${objStmEntries.length} /First ${first} /Length ${objStmData.length} >>\n` +
    "stream\n";
  cursor +=
    byteLen(objStmObj) + objStmData.length + byteLen("\nendstream\nendobj\n");

  const xrefOffset = cursor;
  const rawEntries = new Uint8Array([
    ...FREE_ENTRY_BYTES,
    ...usedEntryBytes(xrefOffset),
    ...usedEntryBytes(objStmObjOffset),
    ...compressedEntryBytes(2, 0),
    ...compressedEntryBytes(2, 1),
    ...compressedEntryBytes(2, 2),
  ]);

  const xrefObj =
    "1 0 obj\n" +
    `<< /Type /XRef /W [1 2 1] /Size 6 /Root 3 0 R /Length ${rawEntries.length} >>\n` +
    "stream\n";
  const footer = `startxref\n${xrefOffset}\n%%EOF\n`;

  return concatBytes([
    encoder.encode(HEADER),
    encoder.encode(objStmObj),
    objStmData,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode(xrefObj),
    rawEntries,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode(footer),
  ]);
};

/**
 * ハイブリッド参照ファイル（ISO 32000-1 §7.5.8.4）を生成する。
 *
 * `startxref` はテキスト形式 xref テーブル（obj0-2 の free/Catalog/Pages のみを列挙、
 * 旧リーダー互換のため ObjStm やそれを指す type=2 エントリは含まない）を指し、その
 * trailer に `/XRefStm` で補助クロスリファレンスストリーム（5 0 obj）を追加する。
 * Page（3 0 obj）は ObjStm（4 0 obj）内にのみ格納され、テキスト xref からは
 * 到達できない — `/XRefStm` を無視すると obj3 は「free/未登録」に見え、
 * `PdfDocument.load` は少なくともページが解決できない状態になる。
 *
 * 補助ストリーム（5 0 obj）自体の `/Root` は `includeRootInStream` で切り替えられる
 * （ISO 32000-1 §7.5.8.4 上、補助ストリームは `/Root` を持たなくてもよい —
 * 本来の文書 trailer はテキストセクション側が供給するため）。
 *
 * @param options - `includeRootInStream`: 補助ストリームに `/Root` を含めるか（既定 `true`）
 * @returns テキストxref + `/XRefStm` によるハイブリッド参照 PDF のバイト列
 */
export const buildHybridReferencePdfWithXRefStm = (
  options: { readonly includeRootInStream?: boolean } = {},
): Uint8Array => {
  const includeRootInStream = options.includeRootInStream ?? true;
  const OBJSTM_OBJECT_NUMBER = 4;
  const obj1 = `1 0 obj\n${CATALOG_BODY}\nendobj\n`;
  const obj2 = `2 0 obj\n${PAGES_BODY}\nendobj\n`;

  let cursor = byteLen(HEADER);
  const obj1Offset = cursor;
  cursor += byteLen(obj1);
  const obj2Offset = cursor;
  cursor += byteLen(obj2);

  const objStmEntries = [{ objNum: 3, body: PAGE_BODY }];
  let bodyCursor = 0;
  const relOffsets: number[] = [];
  for (const e of objStmEntries) {
    relOffsets.push(bodyCursor);
    bodyCursor += byteLen(e.body) + 1;
  }
  const objStmHeaderStr = `${objStmEntries
    .map((e, i) => `${e.objNum} ${relOffsets[i]}`)
    .join(" ")} `;
  const objStmBodyStr = objStmEntries.map((e) => `${e.body} `).join("");
  const objStmData = encoder.encode(objStmHeaderStr + objStmBodyStr);
  const first = byteLen(objStmHeaderStr);

  const obj4Offset = cursor;
  const obj4 =
    "4 0 obj\n" +
    `<< /Type /ObjStm /N ${objStmEntries.length} /First ${first} /Length ${objStmData.length} >>\n` +
    "stream\n";
  cursor +=
    byteLen(obj4) + objStmData.length + byteLen("\nendstream\nendobj\n");

  const obj5Offset = cursor;
  const streamRawEntries = new Uint8Array([
    ...compressedEntryBytes(OBJSTM_OBJECT_NUMBER, 0),
    ...usedEntryBytes(obj4Offset),
    ...usedEntryBytes(obj5Offset),
  ]);
  const rootEntry = includeRootInStream ? "/Root 1 0 R " : "";
  const obj5 =
    "5 0 obj\n" +
    `<< /Type /XRef /W [1 2 1] /Size 6 /Index [3 3] ${rootEntry}` +
    `/Length ${streamRawEntries.length} >>\n` +
    "stream\n";
  cursor +=
    byteLen(obj5) + streamRawEntries.length + byteLen("\nendstream\nendobj\n");

  const xrefOffset2 = cursor;
  const textXrefRows = [
    "0000000000 65535 f \n",
    `${pad10(obj1Offset)} 00000 n \n`,
    `${pad10(obj2Offset)} 00000 n \n`,
  ];
  const textXref = `xref\n0 3\n${textXrefRows.join("")}`;
  const hybridTrailer =
    `trailer\n<< /Size 6 /Root 1 0 R /XRefStm ${obj5Offset} >>\n` +
    `startxref\n${xrefOffset2}\n%%EOF\n`;

  return concatBytes([
    encoder.encode(HEADER),
    encoder.encode(obj1),
    encoder.encode(obj2),
    encoder.encode(obj4),
    objStmData,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode(obj5),
    streamRawEntries,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode(textXref),
    encoder.encode(hybridTrailer),
  ]);
};
