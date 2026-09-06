import { NumberEx } from "../../../ext/number/index";
import type { PdfParseError } from "../../../pdf/errors/index";
import {
  ByteOffset as BO,
  type ByteOffset,
} from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type { PdfValue, TrailerDict } from "../../../pdf/types/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

/** フリーリストの先頭に予約されたオブジェクト番号（ISO 32000-1 §7.5.4）。 */
const FREE_LIST_HEAD_OBJECT_NUMBER = 0;

/**
 * オプションフィールドの値が「実在する」か判定する。
 * PDF辞書のnull値はキー不在と同義（ISO 32000-1 §7.3.9）のため、
 * `{ type: "null" }` は他の型と同様に truthy な PdfValue オブジェクトだが
 * 「不在」として扱わなければならない。
 *
 * @param value - 判定対象の PdfValue（未設定なら `undefined`）
 * @returns 値が存在し、かつ null オブジェクトでなければ `true`
 */
function isPresent(value: PdfValue | undefined): value is PdfValue {
  return value !== undefined && value.type !== "null";
}

interface TrailerDictBuilderChain {
  root(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  size(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  prev(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  info(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  id(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  encrypt(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  xrefStm(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  build(): Result<TrailerDict, PdfParseError>;
}

/**
 * TrailerDict 構築用のクロージャベース Builder を生成する。
 *
 * 必須フィールド (`/Root`, `/Size`) のバリデーション失敗時は
 * それぞれ `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND` を返す。
 * オプションフィールド (`/Prev`, `/Info`, `/ID`) のバリデーション失敗時は
 * `TRAILER_DICT_INVALID` を返す。呼び出し側は `TRAILER_DICT_INVALID` のみを
 * 文脈別コード（例: `XREF_STREAM_INVALID`）に書き換える責務を持つ。
 *
 * @returns メソッドチェーン可能な TrailerDict ビルダー
 */
export function trailerDictBuilder(): TrailerDictBuilderChain {
  let _root: PdfValue | undefined;
  let _rootOffset: ByteOffset | undefined;
  let _size: PdfValue | undefined;
  let _sizeOffset: ByteOffset | undefined;
  let _prev: PdfValue | undefined;
  let _prevOffset: ByteOffset | undefined;
  let _info: PdfValue | undefined;
  let _infoOffset: ByteOffset | undefined;
  let _id: PdfValue | undefined;
  let _idOffset: ByteOffset | undefined;
  let _encrypt: PdfValue | undefined;
  let _encryptOffset: ByteOffset | undefined;
  let _xrefStm: PdfValue | undefined;
  let _xrefStmOffset: ByteOffset | undefined;

  const chain: TrailerDictBuilderChain = {
    root(value?: PdfValue, offset?: ByteOffset) {
      _root = value;
      _rootOffset = offset;
      return chain;
    },
    size(value?: PdfValue, offset?: ByteOffset) {
      _size = value;
      _sizeOffset = offset;
      return chain;
    },
    prev(value?: PdfValue, offset?: ByteOffset) {
      _prev = value;
      _prevOffset = offset;
      return chain;
    },
    info(value?: PdfValue, offset?: ByteOffset) {
      _info = value;
      _infoOffset = offset;
      return chain;
    },
    id(value?: PdfValue, offset?: ByteOffset) {
      _id = value;
      _idOffset = offset;
      return chain;
    },
    encrypt(value?: PdfValue, offset?: ByteOffset) {
      _encrypt = value;
      _encryptOffset = offset;
      return chain;
    },
    xrefStm(value?: PdfValue, offset?: ByteOffset) {
      _xrefStm = value;
      _xrefStmOffset = offset;
      return chain;
    },
    build(): Result<TrailerDict, PdfParseError> {
      // /Root - required, must be IndirectRef
      if (!_root) {
        return err({
          code: "ROOT_NOT_FOUND",
          message: "/Root entry is missing in trailer dictionary",
        });
      }
      if (_root.type !== "indirect-ref") {
        return err({
          code: "ROOT_NOT_FOUND",
          message: "/Root entry is not an indirect reference",
          offset: _rootOffset,
        });
      }
      // ISO 32000-1 §7.3.10: オブジェクト番号は正整数。0（§7.5.4 のフリーリスト先頭）を
      // 指す /Root ではカタログを解決できないため、必須キー欠落と同じ扱いにする（#334）。
      const rootObjNumResult = ObjectNumber.create(_root.objectNumber);
      if (!rootObjNumResult.ok) {
        return err({
          code: "ROOT_NOT_FOUND",
          message: `/Root entry has an invalid object number: ${rootObjNumResult.error}`,
          offset: _rootOffset,
        });
      }
      if (!NumberEx.isSafeIntegerAtLeastZero(_root.generationNumber)) {
        return err({
          code: "ROOT_NOT_FOUND",
          message:
            "/Root entry has an invalid generation number (must be a non-negative safe integer)",
          offset: _rootOffset,
        });
      }
      const rootGenResult = GenerationNumber.create(_root.generationNumber);
      if (!rootGenResult.ok) {
        return err({
          code: "ROOT_NOT_FOUND",
          message:
            "/Root entry has an invalid generation number (out of range)",
          offset: _rootOffset,
        });
      }

      const root = {
        objectNumber: rootObjNumResult.value,
        generationNumber: rootGenResult.value,
      };

      // /Size - required, must be non-negative integer
      if (!_size) {
        return err({
          code: "SIZE_NOT_FOUND",
          message: "/Size entry is missing in trailer dictionary",
        });
      }
      if (
        _size.type !== "integer" ||
        !NumberEx.isSafeIntegerAtLeastZero(_size.value as number)
      ) {
        return err({
          code: "SIZE_NOT_FOUND",
          message: "/Size entry is not a non-negative integer",
          offset: _sizeOffset,
        });
      }
      const size = _size.value as number;

      const result: TrailerDict = { root, size };

      // /Prev - optional, non-negative integer
      if (isPresent(_prev)) {
        if (
          _prev.type !== "integer" ||
          !NumberEx.isSafeIntegerAtLeastZero(_prev.value as number)
        ) {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/Prev entry is not a non-negative integer",
            offset: _prevOffset,
          });
        }
        result.prev = BO.of(_prev.value as number);
      }

      // /Info - optional, IndirectRef
      if (isPresent(_info)) {
        if (_info.type !== "indirect-ref") {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/Info entry is not an indirect reference",
            offset: _infoOffset,
          });
        }
        if (!NumberEx.isSafeIntegerAtLeastZero(_info.generationNumber)) {
          return err({
            code: "TRAILER_DICT_INVALID",
            message:
              "/Info entry has an invalid generation number (must be a non-negative safe integer)",
            offset: _infoOffset,
          });
        }
        const infoGenResult = GenerationNumber.create(_info.generationNumber);
        if (!infoGenResult.ok) {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/Info entry generation number must be in range 0-65535",
            offset: _infoOffset,
          });
        }

        // ISO 32000-1 §7.5.4 / docs/specs/02a_object_resolution.md §2.4: オブジェクト番号 0
        // への参照は常に null に解決される。/Info は optional なので致命エラーにせず
        // 「情報辞書なし」として扱う（#334 / D-5b）。
        // 判定を世代番号の検証より後ろに置いているのは、`/Info 0 65536 R` のような
        // 範囲外の世代番号まで正常終了させないため（順序を入れ替えないこと）。
        // ※ /Prev・/XRefStm は間接参照ではなくバイトオフセットなので対象外
        //   （TRAILER_DICT_INVALID を維持する。畳むと xref チェーンが黙って切れる）。
        if (_info.objectNumber !== FREE_LIST_HEAD_OBJECT_NUMBER) {
          const infoObjNumResult = ObjectNumber.create(_info.objectNumber);
          if (!infoObjNumResult.ok) {
            return err({
              code: "TRAILER_DICT_INVALID",
              message: `/Info entry has an invalid object number: ${infoObjNumResult.error}`,
              offset: _infoOffset,
            });
          }
          result.info = {
            objectNumber: infoObjNumResult.value,
            generationNumber: infoGenResult.value,
          };
        }
      }

      // /ID - optional, must be 2-element array of string objects
      if (isPresent(_id)) {
        if (_id.type !== "array") {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/ID entry must be a 2-element array of strings",
            offset: _idOffset,
          });
        }
        const elements = _id.elements;
        if (elements.length !== 2) {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/ID entry must be a 2-element array of strings",
            offset: _idOffset,
          });
        }
        const idPair: [Uint8Array, Uint8Array] = [
          new Uint8Array(0),
          new Uint8Array(0),
        ];
        for (let i = 0; i < 2; i++) {
          const elem = elements[i];
          if (elem.type !== "string") {
            return err({
              code: "TRAILER_DICT_INVALID",
              message: "/ID entry must be a 2-element array of strings",
              offset: _idOffset,
            });
          }
          idPair[i] = elem.value;
        }

        result.id = idPair;
      }

      // /Encrypt - optional, IndirectRef or Dictionary
      if (isPresent(_encrypt)) {
        if (_encrypt.type === "indirect-ref") {
          if (!NumberEx.isSafeIntegerAtLeastZero(_encrypt.generationNumber)) {
            return err({
              code: "TRAILER_DICT_INVALID",
              message:
                "/Encrypt entry has an invalid generation number (must be a non-negative safe integer)",
              offset: _encryptOffset,
            });
          }
          const encryptGenResult = GenerationNumber.create(
            _encrypt.generationNumber,
          );
          if (!encryptGenResult.ok) {
            return err({
              code: "TRAILER_DICT_INVALID",
              message:
                "/Encrypt entry generation number must be in range 0-65535",
              offset: _encryptOffset,
            });
          }
          // /Info と同じ理由で 0 番参照を「非暗号化」に正規化する（#334 / D-5b）。
          // 判定順序も同じく世代番号の検証より後ろに置く。
          if (_encrypt.objectNumber !== FREE_LIST_HEAD_OBJECT_NUMBER) {
            const encryptObjNumResult = ObjectNumber.create(
              _encrypt.objectNumber,
            );
            if (!encryptObjNumResult.ok) {
              return err({
                code: "TRAILER_DICT_INVALID",
                message: `/Encrypt entry has an invalid object number: ${encryptObjNumResult.error}`,
                offset: _encryptOffset,
              });
            }
            result.encrypt = {
              objectNumber: encryptObjNumResult.value,
              generationNumber: encryptGenResult.value,
            };
          }
        } else if (_encrypt.type === "dictionary") {
          result.encrypt = _encrypt;
        } else {
          return err({
            code: "TRAILER_DICT_INVALID",
            message:
              "/Encrypt entry must be a dictionary or indirect reference",
            offset: _encryptOffset,
          });
        }
      }

      // /XRefStm - optional, non-negative integer (text-format trailer only)
      if (isPresent(_xrefStm)) {
        if (
          _xrefStm.type !== "integer" ||
          !NumberEx.isSafeIntegerAtLeastZero(_xrefStm.value as number)
        ) {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/XRefStm entry is not a non-negative integer",
            offset: _xrefStmOffset,
          });
        }
        result.xrefStm = BO.of(_xrefStm.value as number);
      }

      return ok(result);
    },
  };

  return chain;
}
