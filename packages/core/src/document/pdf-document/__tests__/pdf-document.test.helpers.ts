/**
 * `PdfDocument.load` の振る舞いテストで使う最小限の PDF バイト列ビルダー群。
 */

/**
 * `/Info` 由来のメタデータフィールド。
 * `buildSinglePagePdfWithInfo` に渡す入力構造を表す。
 */
export interface InfoFields {
  readonly title?: string;
  readonly author?: string;
}

const XREF_OFFSET_DIGITS = 10;
const DECIMAL_RADIX = 10;

const PDF_HEADER = "%PDF-1.7\n";
const CATALOG_BODY = "<< /Type /Catalog /Pages 2 0 R >>";
const PAGES_BODY_SINGLE = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const PAGES_BODY_TWO = "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>";
const PAGES_BODY_EMPTY = "<< /Type /Pages /Kids [] /Count 0 >>";
const PAGE_BODY = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>";
const PAGE_BODY_NO_MEDIABOX = "<< /Type /Page /Parent 2 0 R >>";

/**
 * 10 桁ゼロ埋めでオフセットを表現する。xref テーブルの 20 バイト本体規約に従う。
 *
 * @param n - 0 以上の整数オフセット値
 * @returns 10 桁ゼロ埋め文字列
 */
const padOffset10 = (n: number): string =>
  n.toString(DECIMAL_RADIX).padStart(XREF_OFFSET_DIGITS, "0");

const ASCII_MAX = 0x7f;
const HEX_BYTE_DIGITS = 2;
const HEX_RADIX = 16;
const UTF16_HIGH_BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;
const UTF16_BE_BOM_HEX = "feff";

/**
 * 入力文字列が ASCII (U+0000〜U+007F) のみで構成されているかを判定する。
 *
 * @param s - 判定対象の文字列
 * @returns すべて ASCII なら true
 */
const isAscii = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > ASCII_MAX) {
      return false;
    }
  }
  return true;
};

/**
 * 文字列を UTF-16BE BOM 付き hex string `<feff...>` 形式へエンコードする。
 * PDF の string object として非 ASCII 文字を扱う標準的な表現。
 *
 * @param s - エンコード対象の文字列
 * @returns hex string 表記
 */
const toUtf16BeHexString = (s: string): string => {
  const hexParts: string[] = [UTF16_BE_BOM_HEX];
  for (let i = 0; i < s.length; i++) {
    const cu = s.charCodeAt(i);
    const high = (cu >> UTF16_HIGH_BYTE_SHIFT) & BYTE_MASK;
    const low = cu & BYTE_MASK;
    hexParts.push(
      high.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, "0"),
      low.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, "0"),
    );
  }
  return `<${hexParts.join("")}>`;
};

/**
 * 任意の文字列を PDF の string object 表記へエンコードする。
 * - 入力が ASCII のみ: literal string `(...)`（`\\` `(` `)` のみエスケープ）
 * - 非 ASCII を含む: UTF-16BE BOM 付き hex string `<feff...>`
 *
 * いずれの形式も `decodePdfString` 側で復号可能。
 *
 * @param s - エンコード対象の文字列
 * @returns PDF string object 表記
 */
const toPdfString = (s: string): string => {
  if (!isAscii(s)) {
    return toUtf16BeHexString(s);
  }
  const escaped = s.replace(/[\\()]/g, (c) => `\\${c}`);
  return `(${escaped})`;
};

/**
 * オブジェクト本体を `${objNum} 0 obj\n...\nendobj\n` 形式の indirect object 文字列に変換する。
 *
 * @param bodies - オブジェクト本体の配列（`<< ... >>` 等）
 * @param startObjNum - 先頭オブジェクト番号（既定値 1）
 * @returns indirect object 形式の文字列配列
 */
const formatIndirectObjects = (
  bodies: readonly string[],
  startObjNum = 1,
): string[] =>
  bodies.map((body, i) => `${i + startObjNum} 0 obj\n${body}\nendobj\n`);

/**
 * `assembleTextPdf` のオプション。
 */
interface AssembleTextPdfOptions {
  /**
   * `true` のとき trailer 辞書から `/Root` を省略する。
   * Catalog 不在を再現する error fixture 用途のフラグで、通常の正常系 fixture では省略する。
   */
  readonly omitRoot?: boolean;
}

/**
 * 1 0 obj 〜 N 0 obj の本体配列と trailer 追加エントリを与え、
 * テキスト xref 形式の PDF バイト列を組み立てる。
 *
 * `trailerEntries` は trailer 辞書の必須エントリ（`/Size`、および `omitRoot` が
 * false の場合は `/Root 1 0 R`）の **後ろに追記される** 追加エントリ
 * （例: `/Info 4 0 R`）の配列。`omitRoot: true` のときは `/Size` の直後に追記される。
 * 区切りスペースは本関数が付与するため、呼び出し側は先頭スペースを含めない。
 *
 * @param objectBodies - 各オブジェクトの本体（`<< ... >>` 等）
 * @param trailerEntries - trailer 辞書に追記するエントリ。例: `["/Info 4 0 R"]`
 * @param options - 組み立てオプション（`omitRoot` で `/Root` の省略可）
 * @returns 組み立てた PDF バイト列
 */
const assembleTextPdf = (
  objectBodies: readonly string[],
  trailerEntries: readonly string[] = [],
  options: AssembleTextPdfOptions = {},
): Uint8Array => {
  const encoder = new TextEncoder();
  const objs = formatIndirectObjects(objectBodies);

  const offsets: number[] = [];
  let cursor = encoder.encode(PDF_HEADER).length;
  for (const obj of objs) {
    offsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }
  const xrefOffset = cursor;

  const size = objectBodies.length + 1;
  const xrefRows = [
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${padOffset10(o)} 00000 n \n`),
  ];
  const xref = `xref\n0 ${size}\n${xrefRows.join("")}`;
  const rootEntry = options.omitRoot === true ? "" : " /Root 1 0 R";
  const trailerExtras =
    trailerEntries.length === 0 ? "" : ` ${trailerEntries.join(" ")}`;
  const trailer = `trailer\n<< /Size ${size}${rootEntry}${trailerExtras} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(PDF_HEADER + objs.join("") + xref + trailer);
};

/**
 * 1 ページのみを持つ最小構成の PDF を生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj) / Page (3 0 obj, MediaBox=[0 0 612 792])
 * を持つ最小 PDF (テキスト xref) を組み立てる。
 *
 * @returns 1 ページの最小 PDF を表すバイト列
 */
export const buildMinimalSinglePagePdf = (): Uint8Array =>
  assembleTextPdf([CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY]);

/**
 * 1 ページ + `/Info` 辞書を持つ PDF を生成する。
 * `/Info` には `info` で指定された Title / Author のみ収録する。
 *
 * @param info - `/Info` に格納するフィールド
 * @returns `/Info` 付き PDF を表すバイト列
 */
export const buildSinglePagePdfWithInfo = (info: InfoFields): Uint8Array => {
  const fields: string[] = [];
  if (info.title !== undefined) {
    fields.push(`/Title ${toPdfString(info.title)}`);
  }
  if (info.author !== undefined) {
    fields.push(`/Author ${toPdfString(info.author)}`);
  }
  const infoBody = `<< ${fields.join(" ")} >>`;
  return assembleTextPdf(
    [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY, infoBody],
    ["/Info 4 0 R"],
  );
};

/**
 * 2 ページの PDF を生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj, /Count 2) / Page1 (3 0 obj) / Page2 (4 0 obj)
 * の 4 オブジェクト構成。
 *
 * @returns 2 ページ PDF を表すバイト列
 */
export const buildTwoPagePdf = (): Uint8Array =>
  assembleTextPdf([CATALOG_BODY, PAGES_BODY_TWO, PAGE_BODY, PAGE_BODY]);

/**
 * `/Catalog` を欠く不正な PDF を生成する。
 *
 * trailer 辞書から `/Root` を省略し、かつ本体にも `/Type /Catalog` を含めない
 * ことで、scanFallback でも `/Root` を再構築できない状態を作る。ヘッダ /
 * startxref / xref テーブルまでは妥当だが、`mergeXRefChain` 失敗 →
 * `scanFallback` は `Ok({trailer: None, ...})` を返し、`PdfDocument.load`
 * 側の trailer 不在分岐で `ROOT_NOT_FOUND` が返る。
 * `PdfDocument.load` のエラー伝搬テスト (L-003) で使用する。
 *
 * @returns `/Root` を欠き、本体に `/Type /Catalog` も持たない PDF バイト列
 */
export const buildPdfWithoutCatalog = (): Uint8Array =>
  assembleTextPdf([PAGES_BODY_EMPTY], [], { omitRoot: true });

/**
 * `/MediaBox` を欠く不正な PDF を生成する。
 *
 * Page leaf にも親 Pages ノードにも `/MediaBox` が無い構成にすることで、
 * `PageTreeWalker.walk` (継承解決) が `MEDIABOX_NOT_FOUND` を返す入力になる。
 * `PdfDocument.load` のエラー伝搬テスト (L-004) で使用する。
 *
 * @returns ページ・親いずれも `/MediaBox` を持たない PDF バイト列
 */
export const buildPdfWithoutMediaBox = (): Uint8Array =>
  assembleTextPdf([CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY_NO_MEDIABOX]);

/**
 * 破損した `startxref` の値。`%PDF-1.7\n` (9 バイト) 内部のオフセット (バージョン文字列の `1`)
 * を指すため、正常な xref 位置とも先頭の有効構造とも一致しない。
 */
const CORRUPT_STARTXREF_OFFSET_VALUE = 5;

const STARTXREF_LINE_PATTERN = /startxref\n\d+\n%%EOF\n$/;

/**
 * `startxref` の値だけが壊れた PDF を生成する。
 *
 * `assembleTextPdf` で組み立てた正常な末尾構造 (Catalog / Pages / xref / trailer / startxref / %%EOF)
 * の `startxref <正しい xref オフセット>` 部分だけを `startxref {@link CORRUPT_STARTXREF_OFFSET_VALUE}`
 * に置換することで、「xref / trailer は正常だが startxref ポインタだけ壊れている」状態を再現する。
 *
 * - `scanStartXRef` は `Ok({@link CORRUPT_STARTXREF_OFFSET_VALUE})` を返すが、
 *   その位置 (PDF ヘッダのバージョン文字列内) に `xref` キーワードが無いため
 *   `parseXRefTable` (= `mergeXRefChain`) が失敗する
 * - `scanFallback` は obj ヘッダから XRefTable を再構築し、末尾の `trailer` ブロックから
 *   `Ok({trailer: Some, warnings: [XREF_REBUILD]})` を返す
 *
 * fallback 経由の load 成功テスト (L-006 / L-007) で使用する。
 *
 * @returns `startxref` 値破損 + 正常 xref/trailer 末尾を持つ PDF バイト列
 */
export const buildPdfWithCorruptStartXRef = (): Uint8Array => {
  const valid = assembleTextPdf([CATALOG_BODY, PAGES_BODY_EMPTY]);
  const text = new TextDecoder("latin1").decode(valid);
  const corrupted = text.replace(
    STARTXREF_LINE_PATTERN,
    `startxref\n${CORRUPT_STARTXREF_OFFSET_VALUE}\n%%EOF\n`,
  );
  return new TextEncoder().encode(corrupted);
};

/** {@link buildPdfWithCorruptXRefAndNoTrailer} の startxref 値 (ファイル長を超え scanStartXRef を失敗させる)。 */
const CORRUPT_XREF_NO_TRAILER_STARTXREF_VALUE = 9999;

/**
 * xref が破損し、かつ scanFallback でも trailer が組み立てられない PDF を生成する。
 *
 * `/Type /Catalog` を含まない obj (`/Type /Pages` のみ) を 1 つ持ち、`xref` / `startxref`
 * キーワードは存在するが xref エントリは不正、`trailer` キーワードは一切含まない構成。
 *
 * - 通常の xref 解析経路 (`scanStartXRef` 〜 `mergeXRefChain`) は失敗する
 *   (`startxref` 値 {@link CORRUPT_XREF_NO_TRAILER_STARTXREF_VALUE} はファイル長超過)
 * - `scanFallback` は obj ヘッダから XRefTable を再構築するが、
 *   - `findValidTrailer` は `trailer` キーワードを見つけられない (FB-002 不発)
 *   - `inferCatalogRoot` は `/Type /Catalog` を見つけられない (FB-004 不発)
 *   ため `Ok({trailer: None, warnings: [XREF_REBUILD]})` を返す
 *
 * fallback で trailer が確定できない場合のテスト (PR-13 fallback-trailer-none) で使用する。
 *
 * @returns trailer 復元不能な PDF バイト列
 */
export const buildPdfWithCorruptXRefAndNoTrailer = (): Uint8Array => {
  const body =
    "1 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n" +
    "xref\nbroken\n" +
    `startxref\n${CORRUPT_XREF_NO_TRAILER_STARTXREF_VALUE}\n%%EOF\n`;
  return new TextEncoder().encode(PDF_HEADER + body);
};

/**
 * `/Version` に不正な name を持つ Catalog + 1 ページの PDF を生成する。
 *
 * Catalog (1 0 obj) の body に `/Version /BogusName` を追加し、
 * `PdfVersion.create("BogusName")` を失敗させる。`CatalogParser.parse` は
 * `CATALOG_VERSION_INVALID` warning を `ParsedCatalog.warnings` に push し、
 * `pdf-document/index.ts` の `emitWarnings` が `onWarning` へ配線する。
 * `PdfDocument.load` の e2e smoke テストで使用する。
 *
 * @returns 不正 `/Version` name を持つ 1 ページ PDF のバイト列
 */
export const buildPdfWithInvalidCatalogVersion = (): Uint8Array =>
  assembleTextPdf([
    "<< /Type /Catalog /Pages 2 0 R /Version /BogusName >>",
    PAGES_BODY_SINGLE,
    PAGE_BODY,
  ]);

/**
 * ヘッダのみで本体を持たない PDF を生成する。
 *
 * `%PDF-1.7\n%%EOF\n` のみを返す。`startxref` キーワードが存在しないため、
 * `scanStartXRef` は `STARTXREF_NOT_FOUND` を返す。
 * `PdfDocument.load` の L-002 (header-only → ROOT_NOT_FOUND) テストで使用する。
 *
 * @returns ヘッダのみの PDF を表すバイト列
 */
export const buildPdfHeaderOnly = (): Uint8Array =>
  new TextEncoder().encode(`${PDF_HEADER}%%EOF\n`);

/** {@link buildPdfWithInvalidInfoRef} で trailer `/Info` が指す壊れたオブジェクト番号。Catalog/Pages/Page の次に予約する。 */
const INVALID_INFO_REF_OBJECT_NUMBER = 4;

/**
 * `/Info` の参照は xref に存在するが、解決すると obj ヘッダ不一致でエラーになる PDF を生成する。
 *
 * trailer に `/Info {@link INVALID_INFO_REF_OBJECT_NUMBER} 0 R` を持たせ、xref には当該
 * オブジェクト番号のエントリを含めるが、その offset は別オブジェクト (Catalog 1 0 R) の
 * 開始位置を指すように細工する。`object-store` の inline reader は要求された
 * `4 0 obj` を期待しつつ実際には `1 0 obj` ヘッダを読むため、`OBJECT_PARSE_UNEXPECTED_TOKEN`
 * のエラーを返す。`DocumentInfoParser.parse` はこれを `INFO_RESOLVE_FAILED` warning に
 * 変換し、`EMPTY_METADATA` を返す。
 *
 * `PdfDocument.load` の L-009 (`/Info` 不正参照 → warning + 空 metadata) テストで使用する。
 *
 * @returns `/Info` 参照不正 + 正常な Catalog/Pages/Page を持つ PDF バイト列
 */
export const buildPdfWithInvalidInfoRef = (): Uint8Array => {
  const encoder = new TextEncoder();
  const objectBodies = [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY];
  const objs = formatIndirectObjects(objectBodies);

  const offsets: number[] = [];
  let cursor = encoder.encode(PDF_HEADER).length;
  for (const obj of objs) {
    offsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }
  const xrefOffset = cursor;

  const size = INVALID_INFO_REF_OBJECT_NUMBER + 1;
  const catalogOffset = offsets[0];
  const xrefRows = [
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${padOffset10(o)} 00000 n \n`),
    `${padOffset10(catalogOffset)} 00000 n \n`,
  ];
  const xref = `xref\n0 ${size}\n${xrefRows.join("")}`;
  const trailer = `trailer\n<< /Size ${size} /Root 1 0 R /Info ${INVALID_INFO_REF_OBJECT_NUMBER} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(PDF_HEADER + objs.join("") + xref + trailer);
};

const INCREMENTAL_UPDATE_NEW_PAGE_WIDTH = 200;
const INCREMENTAL_UPDATE_NEW_PAGE_HEIGHT = 300;
const INCREMENTAL_UPDATE_NEW_SECTION_FIRST_OBJ_NUM = 4;

/** incremental update fixture で新 Page が持つ MediaBox。旧 Page の `[0 0 612 792]` と区別するため意図的に異なる値にする。 */
const INCREMENTAL_UPDATE_NEW_PAGE_MEDIA_BOX: readonly [
  number,
  number,
  number,
  number,
] = [
  0,
  0,
  INCREMENTAL_UPDATE_NEW_PAGE_WIDTH,
  INCREMENTAL_UPDATE_NEW_PAGE_HEIGHT,
];

/**
 * インクリメンタルアップデートを含む PDF を生成する。
 *
 * 旧 xref (旧 trailer の `/Root 1 0 R`) と、`/Prev` で旧 xref を指す新 xref +
 * 新 trailer (新 `/Root 4 0 R`) を持つ incremental update PDF を組み立てる。
 *
 * - 旧セクション: Catalog (1 0 R) / Pages (2 0 R, `/Kids [3 0 R]`) /
 *   Page (3 0 R, `MediaBox [0 0 612 792]`) と `xref 0 4` 形式の単一サブセクション、
 *   `/Size 4 /Root 1 0 R` の旧 trailer。
 * - 新セクション: 新 Catalog (4 0 R, `/Pages 5 0 R`) と新 Pages (5 0 R, `/Kids [6 0 R]`) /
 *   新 Page (6 0 R, MediaBox は {@link INCREMENTAL_UPDATE_NEW_PAGE_MEDIA_BOX})、
 *   `0 1` + `4 3` の 2 サブセクション形式の新 xref、
 *   `/Size 7 /Root 4 0 R /Prev <oldXrefOffset>` の新 trailer。
 *
 * `mergeXRefChain` は startxref から新 xref を読み、`/Prev` を辿って旧 xref
 * を merge し、最新 trailer の `/Root` (= 新 Catalog 4 0 R) を採用する。
 * 新 Catalog 配下の Page は旧 Page と異なる MediaBox を持つため、
 * 「最新 trailer の `/Root` 経由で page 構造が観測される」ことをテストで検証できる。
 *
 * @returns インクリメンタルアップデート付き PDF を表すバイト列
 */
export const buildPdfWithIncrementalUpdate = (): Uint8Array => {
  const encoder = new TextEncoder();

  const oldObjBodies = [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY];
  const oldObjs = formatIndirectObjects(oldObjBodies);

  const oldOffsets: number[] = [];
  let cursor = encoder.encode(PDF_HEADER).length;
  for (const obj of oldObjs) {
    oldOffsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }
  const oldXrefOffset = cursor;

  const oldSize = oldObjBodies.length + 1;
  const oldXrefRows = [
    "0000000000 65535 f \n",
    ...oldOffsets.map((o) => `${padOffset10(o)} 00000 n \n`),
  ];
  const oldXref = `xref\n0 ${oldSize}\n${oldXrefRows.join("")}`;
  const oldTrailer = `trailer\n<< /Size ${oldSize} /Root 1 0 R >>\nstartxref\n${oldXrefOffset}\n%%EOF\n`;
  const oldTail = oldXref + oldTrailer;
  cursor += encoder.encode(oldTail).length;

  const [mbX, mbY, mbW, mbH] = INCREMENTAL_UPDATE_NEW_PAGE_MEDIA_BOX;
  const newCatalogObjNum = INCREMENTAL_UPDATE_NEW_SECTION_FIRST_OBJ_NUM;
  const newPagesObjNum = newCatalogObjNum + 1;
  const newPageObjNum = newCatalogObjNum + 2;
  const newObjBodies = [
    `<< /Type /Catalog /Pages ${newPagesObjNum} 0 R >>`,
    `<< /Type /Pages /Kids [${newPageObjNum} 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent ${newPagesObjNum} 0 R /MediaBox [${mbX} ${mbY} ${mbW} ${mbH}] >>`,
  ];
  const newObjs = formatIndirectObjects(
    newObjBodies,
    INCREMENTAL_UPDATE_NEW_SECTION_FIRST_OBJ_NUM,
  );

  const newOffsets: number[] = [];
  for (const obj of newObjs) {
    newOffsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }
  const newXrefOffset = cursor;

  const newSize = oldSize + newObjBodies.length;
  const newSubsection2Rows = newOffsets
    .map((o) => `${padOffset10(o)} 00000 n \n`)
    .join("");
  const newXref =
    `xref\n` +
    `0 1\n0000000000 65535 f \n` +
    `${INCREMENTAL_UPDATE_NEW_SECTION_FIRST_OBJ_NUM} ${newObjBodies.length}\n${newSubsection2Rows}`;
  const newTrailer = `trailer\n<< /Size ${newSize} /Root ${INCREMENTAL_UPDATE_NEW_SECTION_FIRST_OBJ_NUM} 0 R /Prev ${oldXrefOffset} >>\nstartxref\n${newXrefOffset}\n%%EOF\n`;

  return encoder.encode(
    PDF_HEADER +
      oldObjs.join("") +
      oldTail +
      newObjs.join("") +
      newXref +
      newTrailer,
  );
};

// --- xref ストリーム / ハイブリッド参照 (/XRefStm) fixture 用ヘルパー ---

/** xref ストリーム fixture 共通の `/W` 配列（1エントリ4バイト固定）。 */
const XREF_STREAM_W: readonly [number, number, number] = [1, 2, 1];

/**
 * バイト列を結合する。
 *
 * @param chunks - 結合対象のバイト列配列
 * @returns 結合後のバイト列
 */
const concatUint8Arrays = (chunks: readonly Uint8Array[]): Uint8Array => {
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
 * zlib (FlateDecode) でバイト列を圧縮する。本体側 `decompressFlate` の逆変換として、
 * xref ストリーム / ObjStm fixture のストリームデータ組み立てに使う。
 *
 * @param data - 圧縮対象のバイト列
 * @returns 圧縮後のバイト列
 */
const compressFlate = async (data: Uint8Array): Promise<Uint8Array> => {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const bufPromise = new Response(cs.readable).arrayBuffer();
  await writer.write(data as BufferSource);
  await writer.close();
  return new Uint8Array(await bufPromise);
};

/**
 * `XREF_STREAM_W` (`/W [1 2 1]`) 固定幅で1エントリ分のバイト列を組み立てる。
 *
 * @param type - エントリ種別 (0=free, 1=used, 2=compressed)
 * @param field2 - type=1ならオフセット、type=2なら親ストリームのオブジェクト番号（2バイトBE）
 * @param field3 - type=0,1なら世代番号、type=2ならストリーム内インデックス（1バイト）
 * @returns 4バイトのエントリ
 */
const xrefStreamEntryBytes = (
  type: number,
  field2: number,
  field3: number,
): number[] => {
  const FIELD2_BYTE_SHIFT = 8;
  const BYTE_MASK = 0xff;
  return [
    type,
    (field2 >> FIELD2_BYTE_SHIFT) & BYTE_MASK,
    field2 & BYTE_MASK,
    field3,
  ];
};

/**
 * xref ストリーム形式（テキスト xref を持たない PDF 1.5+ 形式）のみで構成される
 * 1 ページの最小 PDF を生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj) / Page (3 0 obj) に加え、xref テーブルの
 * 代わりに xref ストリーム (4 0 obj, `/Type /XRef`) を持つ。`startxref` は
 * 直接この xref ストリームを指す。
 *
 * `PdfDocument.load` が `parseXRefAt` で `xref` キーワードでなく間接オブジェクトを
 * 検出し、`parseXRefStream` 経由の xref ストリーム経路を通ることを検証する fixture。
 *
 * @returns xref ストリーム形式の 1 ページ PDF を表すバイト列
 */
export const buildMinimalSinglePagePdfWithXRefStream =
  async (): Promise<Uint8Array> => {
    const encoder = new TextEncoder();
    const objectBodies = [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY];
    const objs = formatIndirectObjects(objectBodies);

    const offsets: number[] = [];
    let cursor = encoder.encode(PDF_HEADER).length;
    for (const obj of objs) {
      offsets.push(cursor);
      cursor += encoder.encode(obj).length;
    }
    const xrefStreamObjNum = objectBodies.length + 1;
    const xrefStreamOffset = cursor;

    const rawEntries = [
      xrefStreamEntryBytes(0, 0, 0),
      xrefStreamEntryBytes(1, offsets[0], 0),
      xrefStreamEntryBytes(1, offsets[1], 0),
      xrefStreamEntryBytes(1, offsets[2], 0),
      xrefStreamEntryBytes(1, xrefStreamOffset, 0),
    ].flat();
    const compressed = await compressFlate(new Uint8Array(rawEntries));

    const size = xrefStreamObjNum + 1;
    const dict =
      `<< /Type /XRef /Filter /FlateDecode /W [${XREF_STREAM_W.join(" ")}] ` +
      `/Size ${size} /Root 1 0 R /Length ${compressed.length} >>`;

    return concatUint8Arrays([
      encoder.encode(PDF_HEADER),
      ...objs.map((o) => encoder.encode(o)),
      encoder.encode(`${xrefStreamObjNum} 0 obj\n${dict}\nstream\n`),
      compressed,
      encoder.encode("\nendstream\nendobj\n"),
      encoder.encode(`startxref\n${xrefStreamOffset}\n%%EOF\n`),
    ]);
  };

/**
 * `/Type` が `/XRef` でないストリームを xref ストリーム位置に持つ PDF を生成する。
 *
 * `startxref` が指す間接オブジェクトはストリームだが `/Type /NotXRef` であり、
 * `XRefStreamDict.parse` の型不一致検出により `XREF_STREAM_INVALID` を返す
 * ことを `PdfDocument.load` 経由で検証する fixture。ストリームデータは
 * {@link buildMinimalSinglePagePdfWithXRefStream} と同じ（`/Type` 検証で
 * 早期に失敗するため実際には展開されず内容は無関係）。
 *
 * @returns `/Type /XRef` でないストリームを xref 位置に持つ PDF バイト列
 */
export const buildPdfWithWrongTypeXRefStream =
  async (): Promise<Uint8Array> => {
    const encoder = new TextEncoder();
    const objectBodies = [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY];
    const objs = formatIndirectObjects(objectBodies);

    const offsets: number[] = [];
    let cursor = encoder.encode(PDF_HEADER).length;
    for (const obj of objs) {
      offsets.push(cursor);
      cursor += encoder.encode(obj).length;
    }
    const xrefStreamObjNum = objectBodies.length + 1;
    const xrefStreamOffset = cursor;

    const rawEntries = [
      xrefStreamEntryBytes(0, 0, 0),
      xrefStreamEntryBytes(1, offsets[0], 0),
      xrefStreamEntryBytes(1, offsets[1], 0),
      xrefStreamEntryBytes(1, offsets[2], 0),
      xrefStreamEntryBytes(1, xrefStreamOffset, 0),
    ].flat();
    const compressed = await compressFlate(new Uint8Array(rawEntries));

    const size = xrefStreamObjNum + 1;
    const dict =
      `<< /Type /NotXRef /Filter /FlateDecode /W [${XREF_STREAM_W.join(" ")}] ` +
      `/Size ${size} /Root 1 0 R /Length ${compressed.length} >>`;

    return concatUint8Arrays([
      encoder.encode(PDF_HEADER),
      ...objs.map((o) => encoder.encode(o)),
      encoder.encode(`${xrefStreamObjNum} 0 obj\n${dict}\nstream\n`),
      compressed,
      encoder.encode("\nendstream\nendobj\n"),
      encoder.encode(`startxref\n${xrefStreamOffset}\n%%EOF\n`),
    ]);
  };

/** {@link buildPdfWithHybridXRefStm} で ObjStm 内にのみ存在する `/Info` のオブジェクト番号。 */
const HYBRID_INFO_OBJECT_NUMBER = 4;
/** {@link buildPdfWithHybridXRefStm} の ObjStm 自体のオブジェクト番号。 */
const HYBRID_OBJSTM_OBJECT_NUMBER = 5;
/** {@link buildPdfWithHybridXRefStm} の xref ストリーム（`/XRefStm` が指す先）のオブジェクト番号。 */
const HYBRID_XREF_STREAM_OBJECT_NUMBER = 6;
/** {@link buildPdfWithHybridXRefStm} が ObjStm 経由で載せる `/Title` の値。 */
const HYBRID_INFO_TITLE = "Hybrid Test";

/**
 * ハイブリッド参照ファイル（テキスト xref + `/XRefStm`）を生成する。
 *
 * テキスト形式 xref は obj 0〜3（Catalog/Pages/Page）のみを収録し、ObjStm
 * 内に格納された `/Info` オブジェクト（obj {@link HYBRID_INFO_OBJECT_NUMBER}）と
 * ObjStm 自体（obj {@link HYBRID_OBJSTM_OBJECT_NUMBER}）はテキスト xref に
 * 一切現れない。trailer の `/XRefStm` が指す xref ストリーム
 * （obj {@link HYBRID_XREF_STREAM_OBJECT_NUMBER}）にのみ、obj
 * {@link HYBRID_INFO_OBJECT_NUMBER}（type=2, 圧縮）と obj
 * {@link HYBRID_OBJSTM_OBJECT_NUMBER}（type=1, 通常）のエントリが存在する。
 *
 * `/Prev` を辿る前に `/XRefStm` を解決し、ObjStm 内オブジェクトが正しく解決
 * される（`metadata.title` が {@link HYBRID_INFO_TITLE} になる）ことを検証する
 * fixture（ISO 32000-1 §7.5.8.4）。
 *
 * @returns ハイブリッド参照 PDF を表すバイト列
 */
export const buildPdfWithHybridXRefStm = async (): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  const objectBodies = [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY];
  const objs = formatIndirectObjects(objectBodies);

  const offsets: number[] = [];
  let cursor = encoder.encode(PDF_HEADER).length;
  for (const obj of objs) {
    offsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }

  const objStmHeader = `${HYBRID_INFO_OBJECT_NUMBER} 0\n`;
  const objStmObjectData = `<< /Title ${toPdfString(HYBRID_INFO_TITLE)} >>`;
  const objStmFirst = encoder.encode(objStmHeader).length;
  const objStmDecompressed = encoder.encode(objStmHeader + objStmObjectData);
  const objStmCompressed = await compressFlate(objStmDecompressed);

  const objStmDict =
    `<< /Type /ObjStm /N 1 /First ${objStmFirst} /Filter /FlateDecode ` +
    `/Length ${objStmCompressed.length} >>`;
  const objStmOffset = cursor;
  const objStmBytes = concatUint8Arrays([
    encoder.encode(
      `${HYBRID_OBJSTM_OBJECT_NUMBER} 0 obj\n${objStmDict}\nstream\n`,
    ),
    objStmCompressed,
    encoder.encode("\nendstream\nendobj\n"),
  ]);
  cursor += objStmBytes.length;

  const xrefStreamRawEntries = [
    xrefStreamEntryBytes(2, HYBRID_OBJSTM_OBJECT_NUMBER, 0),
    xrefStreamEntryBytes(1, objStmOffset, 0),
  ].flat();
  const xrefStreamCompressed = await compressFlate(
    new Uint8Array(xrefStreamRawEntries),
  );

  const xrefStreamSize = HYBRID_XREF_STREAM_OBJECT_NUMBER + 1;
  const xrefStreamDict =
    `<< /Type /XRef /Filter /FlateDecode /W [${XREF_STREAM_W.join(" ")}] ` +
    `/Index [${HYBRID_INFO_OBJECT_NUMBER} 1 ${HYBRID_OBJSTM_OBJECT_NUMBER} 1] ` +
    `/Size ${xrefStreamSize} /Root 1 0 R /Length ${xrefStreamCompressed.length} >>`;
  const xrefStreamOffset = cursor;
  const xrefStreamBytes = concatUint8Arrays([
    encoder.encode(
      `${HYBRID_XREF_STREAM_OBJECT_NUMBER} 0 obj\n${xrefStreamDict}\nstream\n`,
    ),
    xrefStreamCompressed,
    encoder.encode("\nendstream\nendobj\n"),
  ]);
  cursor += xrefStreamBytes.length;

  const textXrefOffset = cursor;
  const textXrefRows = [
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${padOffset10(o)} 00000 n \n`),
  ];
  const textXref = `xref\n0 ${objectBodies.length + 1}\n${textXrefRows.join("")}`;
  const trailer =
    `trailer\n<< /Size ${xrefStreamSize} /Root 1 0 R /Info ${HYBRID_INFO_OBJECT_NUMBER} 0 R ` +
    `/XRefStm ${xrefStreamOffset} >>\nstartxref\n${textXrefOffset}\n%%EOF\n`;

  return concatUint8Arrays([
    encoder.encode(PDF_HEADER),
    ...objs.map((o) => encoder.encode(o)),
    objStmBytes,
    xrefStreamBytes,
    encoder.encode(textXref + trailer),
  ]);
};

/**
 * trailer に `/Encrypt` を持つ暗号化 PDF を生成する。
 *
 * Catalog / Pages / Page は通常構成だが、trailer に `/Encrypt 4 0 R` を追加する。
 * 参照先オブジェクト (4 0 obj) は実際には定義しない — `PdfDocument.load` は
 * `/Encrypt` の値を解決せず、trailer にエントリが存在するかどうかのみで
 * `ENCRYPTED_PDF_UNSUPPORTED` を返すため、参照先の実在は不要。
 *
 * @returns `/Encrypt` を持つ PDF バイト列
 */
export const buildPdfWithEncryptDict = (): Uint8Array =>
  assembleTextPdf(
    [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY],
    ["/Encrypt 4 0 R"],
  );
