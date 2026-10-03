import { NumberEx } from "../../../ext/number/index";
import type { PdfError } from "../../../pdf/errors/index";
import { PdfFilter } from "../../../pdf/filter/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import type { PdfValue } from "../../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import { ObjectParser } from "../../object-parser/index";
import { ObjectStreamDict } from "../dict/index";
import {
  createFlateDecompressor,
  DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE,
} from "../flate-decompressor/index";
import {
  ObjectStreamHeader,
  type ObjectStreamHeaderEntry,
} from "../header/index";
import type {
  ObjectStreamExtractOptions,
  ObjectStreamFindOptions,
} from "../types";

/** 辞書検証・展開・/First の範囲確認を通過した ObjStm。 */
interface PreparedObjectStream {
  readonly first: number;
  readonly n: number;
  readonly data: Uint8Array;
}

const PreparedObjectStream = {
  /**
   * パース済みの辞書情報を再利用し、必要に応じて本文を展開する。
   *
   * @param options - 対象ストリーム、任意のパース済み辞書情報と展開キャッシュ
   * @param index - インデックス抽出時の対象位置。番号検索時は None
   * @returns 展開済み ObjStm、または辞書・インデックス・展開・範囲のエラー
   */
  async create(
    options: ObjectStreamFindOptions,
    index: Option<number> = none,
  ): Promise<Result<PreparedObjectStream, PdfError>> {
    const dictResult =
      options.dictionary === undefined
        ? ObjectStreamDict.parse(options.stream.dictionary.entries)
        : ok(options.dictionary);
    if (!dictResult.ok) {
      return dictResult;
    }
    const { first, n, needsDecompress } = dictResult.value;
    const indexOutOfRange = index.some && index.value >= n;
    if (indexOutOfRange) {
      return err({
        code: "OBJECT_STREAM_INDEX_OUT_OF_RANGE",
        message: `indexInStream ${index.value} is out of range (N=${n})`,
      });
    }

    const dataResult = await PreparedObjectStream.readData(
      options,
      needsDecompress,
    );
    if (!dataResult.ok) {
      return dataResult;
    }
    const data = dataResult.value;
    if (first > data.length) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `/First (${first}) exceeds decompressed data length (${data.length})`,
      });
    }
    return ok({ first, n, data });
  },

  /**
   * 未圧縮本文またはキャッシュを優先して展開済みデータを取得する。
   *
   * @param options - 対象ストリームと展開キャッシュ
   * @param needsDecompress - フィルタ展開が必要か
   * @returns 本文のバイト列、または展開エラー
   */
  async readData(
    options: ObjectStreamFindOptions,
    needsDecompress: boolean,
  ): Promise<Result<Uint8Array, PdfError>> {
    const { stream, streamObjNum, cache } = options;
    if (!needsDecompress) {
      return ok(stream.data);
    }
    const cached = cache?.get(streamObjNum);
    if (cached !== undefined) {
      return ok(cached);
    }
    const filter = PdfFilter.parse(stream.dictionary.entries);
    if (!filter.ok) {
      return filter;
    }
    const result =
      filter.value === "FlateDecode"
        ? await createFlateDecompressor().decompress(stream.data)
        : await PdfFilter.decode(stream.data, filter.value, {
            maxDecompressedSize: DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE,
          });
    if (result.ok) {
      cache?.set(streamObjNum, result.value);
    }
    return result;
  },

  /**
   * 選択したヘッダの本文範囲を検証し、PDF 値をパースする。
   *
   * @param prepared - 展開と辞書検証を通過したストリーム
   * @param headers - 対象位置と、存在する場合は次の位置まで読んだヘッダ
   * @param index - 選択したヘッダの位置
   * @returns 対象の PDF 値、または範囲・構文・ストリーム値のエラー
   */
  parseAt(
    prepared: PreparedObjectStream,
    headers: readonly ObjectStreamHeaderEntry[],
    index: number,
  ): Result<PdfValue, PdfError> {
    const { data, first } = prepared;
    const targetHeader = headers[index];
    const startOffset = first + targetHeader.offset;
    if (startOffset > data.length) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Object offset ${startOffset} exceeds decompressed data length (${data.length})`,
      });
    }
    const nextHeader = headers[index + 1];
    const decreasingOffsets =
      nextHeader !== undefined && nextHeader.offset < targetHeader.offset;
    if (decreasingOffsets) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `ObjStm header offsets are not monotonic: next offset ${nextHeader.offset} < current offset ${targetHeader.offset}`,
      });
    }
    const endOffset =
      nextHeader === undefined ? data.length : first + nextHeader.offset;
    if (endOffset > data.length) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Next object offset ${endOffset} exceeds decompressed data length (${data.length})`,
      });
    }
    if (startOffset >= endOffset) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Object data range is empty: startOffset=${startOffset}, endOffset=${endOffset}`,
      });
    }

    const parseResult = ObjectParser.parse(
      data.subarray(startOffset, endOffset),
      ByteOffset.of(0),
    );
    if (!parseResult.ok) {
      return parseResult;
    }
    if (parseResult.value.type === "stream") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm must not contain stream objects",
      });
    }
    return ok(parseResult.value);
  },
} as const;

/** ObjStm ボディ部からオブジェクトを抽出するコンパニオンオブジェクト。 */
export const ObjectStreamBody = {
  /**
   * xref インデックスと対象番号の一致を検証してオブジェクトを抽出する。
   *
   * @param options - ストリーム、任意のパース済み辞書情報、対象番号、インデックス、展開キャッシュ
   * @returns 対象の PDF 値、または辞書・展開・ヘッダ・本文のエラー
   */
  async extract(
    options: ObjectStreamExtractOptions,
  ): Promise<Result<PdfValue, PdfError>> {
    const { targetObjNum, indexInStream } = options;
    if (!NumberEx.isSafeIntegerAtLeastZero(indexInStream)) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `indexInStream must be a non-negative safe integer, got ${indexInStream}`,
      });
    }
    const preparedResult = await PreparedObjectStream.create(
      options,
      some(indexInStream),
    );
    if (!preparedResult.ok) {
      return preparedResult;
    }
    const prepared = preparedResult.value;
    const needNext = indexInStream + 1 < prepared.n;
    const parseCount = indexInStream + 1 + (needNext ? 1 : 0);
    const headerResult = ObjectStreamHeader.parse(
      prepared.data,
      prepared.first,
      parseCount,
    );
    if (!headerResult.ok) {
      return headerResult;
    }
    const headers = headerResult.value;
    const targetHeader = headers[indexInStream];
    if (targetHeader.objNum !== targetObjNum) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `ObjStm header objNum ${targetHeader.objNum} does not match target ${targetObjNum}`,
      });
    }
    return PreparedObjectStream.parseAt(prepared, headers, indexInStream);
  },

  /**
   * 全ヘッダを読み、オブジェクト番号で対象を検索する。
   *
   * @param options - ストリーム、任意のパース済み辞書情報、対象番号、展開キャッシュ
   * @returns 対象の PDF 値、対象不在時は None、破損時はエラー
   */
  async find(
    options: ObjectStreamFindOptions,
  ): Promise<Result<Option<PdfValue>, PdfError>> {
    const preparedResult = await PreparedObjectStream.create(options);
    if (!preparedResult.ok) {
      return preparedResult;
    }
    const prepared = preparedResult.value;
    const headerResult = ObjectStreamHeader.parse(
      prepared.data,
      prepared.first,
      prepared.n,
    );
    if (!headerResult.ok) {
      return headerResult;
    }
    const headers = headerResult.value;
    const index = headers.findIndex(
      (header) => header.objNum === options.targetObjNum,
    );
    if (index < 0) {
      return ok(none);
    }
    const result = PreparedObjectStream.parseAt(prepared, headers, index);
    if (!result.ok) {
      return result;
    }
    return ok(some(result.value));
  },
} as const;
