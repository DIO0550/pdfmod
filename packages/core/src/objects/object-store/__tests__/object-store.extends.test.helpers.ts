import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { XRefEntry } from "../../../pdf/types/pdf-types/index";
import type { ObjectStoreSource } from "../types";
import { makeStoreSource, makeXRefTable } from "./object-store.test.helpers";

/** 実バイトの ObjStm または不正な親オブジェクトを生成する入力。 */
export interface ObjectStreamFixture {
  readonly objectNumber: number;
  readonly generationNumber?: number;
  readonly extendsRef?: {
    readonly objectNumber: number;
    readonly generationNumber?: number;
  };
  readonly objects?: readonly {
    readonly objectNumber: number;
    readonly body: string;
  }[];
  readonly type?: string;
  readonly inlineBody?: string;
  readonly lengthRef?: number;
}

const encoder = new TextEncoder();
const ChainStartObjectNumber = 10;

/**
 * 子と親の ObjStm を並べ、各オブジェクトの実オフセットを持つソースを生成する。
 *
 * @param streams - 各ストリームの本文・親参照
 * @param compressed - xref type=2 の対象と格納先
 * @returns ObjectStore に渡す実バイトと xref
 */
export function makeCollectionSource(
  streams: readonly ObjectStreamFixture[],
  compressed: readonly {
    readonly objectNumber: number;
    readonly streamObject: number;
    readonly indexInStream?: number;
  }[] = [{ objectNumber: 5, streamObject: 10 }],
): ObjectStoreSource {
  const fragments = streams.map((stream) => {
    const objects = stream.objects ?? [];
    const header = objects
      .map((object, index) => {
        const offset = objects
          .slice(0, index)
          .reduce(
            (sum, item) => sum + encoder.encode(`${item.body}\n`).length,
            0,
          );
        return `${object.objectNumber} ${offset} `;
      })
      .join("");
    const body = objects.map((object) => `${object.body}\n`).join("");
    const data = header + body;
    const extendsRef = stream.extendsRef;
    const extendsEntry =
      extendsRef === undefined
        ? ""
        : `/Extends ${extendsRef.objectNumber} ${extendsRef.generationNumber ?? 0} R `;
    const length =
      stream.lengthRef === undefined
        ? String(encoder.encode(data).length)
        : `${stream.lengthRef} 0 R`;
    const streamBody = `<< /Type /${stream.type ?? "ObjStm"} /N ${objects.length} /First ${encoder.encode(header).length} ${extendsEntry}/Length ${length} >>\nstream\n${data}\nendstream`;
    return `${stream.objectNumber} ${stream.generationNumber ?? 0} obj\n${stream.inlineBody ?? streamBody}\nendobj\n`;
  });
  const streamEntries: (readonly [number, XRefEntry])[] = streams.map(
    (stream, index) => [
      stream.objectNumber,
      {
        type: 1,
        offset: ByteOffset.of(
          fragments
            .slice(0, index)
            .reduce(
              (sum, fragment) => sum + encoder.encode(fragment).length,
              0,
            ),
        ),
        generationNumber: GenerationNumber.of(stream.generationNumber ?? 0),
      },
    ],
  );
  const compressedEntries: (readonly [number, XRefEntry])[] = compressed.map(
    (entry) => [
      entry.objectNumber,
      {
        type: 2,
        streamObject: ObjectNumber.of(entry.streamObject),
        indexInStream: entry.indexInStream ?? 0,
      },
    ],
  );
  return makeStoreSource({
    data: encoder.encode(fragments.join("")),
    xref: makeXRefTable([...streamEntries, ...compressedEntries]),
  });
}

/**
 * 指定件数の直線チェーンを生成し、末尾に対象オブジェクトを置く。
 *
 * @param count - 起点を含むストリーム数
 * @returns 末尾だけに対象番号 5 を持つチェーン
 */
export function makeChainSource(count: number): ObjectStoreSource {
  const streams = Array.from(
    { length: count },
    (_, index): ObjectStreamFixture => ({
      objectNumber: ChainStartObjectNumber + index,
      extendsRef:
        index + 1 < count
          ? { objectNumber: ChainStartObjectNumber + index + 1 }
          : undefined,
      objects: index + 1 === count ? [{ objectNumber: 5, body: "42" }] : [],
    }),
  );
  return makeCollectionSource(streams);
}

/**
 * 2つの子が親を共有する並行取得用のソースを生成する。
 *
 * @param options - 親のさらに先の参照（省略時は親で終端）
 * @returns 対象番号 5, 6 を共有する親に格納したソース
 */
export function makeSharedParentSource(
  options: { readonly parentExtends?: number } = {},
): ObjectStoreSource {
  const extendsRef =
    options.parentExtends === undefined
      ? undefined
      : { objectNumber: options.parentExtends };
  return makeCollectionSource(
    [
      { objectNumber: 10, extendsRef: { objectNumber: 30 } },
      { objectNumber: 20, extendsRef: { objectNumber: 30 } },
      {
        objectNumber: 30,
        extendsRef,
        objects: [
          { objectNumber: 5, body: "true" },
          { objectNumber: 6, body: "false" },
        ],
      },
    ],
    [
      { objectNumber: 5, streamObject: 10 },
      { objectNumber: 6, streamObject: 20 },
    ],
  );
}
