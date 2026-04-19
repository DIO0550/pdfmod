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

interface TrailerDictBuilderChain {
  root(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  size(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  prev(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  info(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  id(value?: PdfValue, offset?: ByteOffset): TrailerDictBuilderChain;
  build(): Result<TrailerDict, PdfParseError>;
}

/**
 * TrailerDict 構築用のクロージャベース Builder を生成する。
 *
 * 必須フィールド (`/Root`, `/Size`) のバリデーション失敗時は
 * それぞれ `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND` を返す。
 * オプションフィールド (`/Prev`, `/Info`, `/ID`) のバリデーション失敗時は
 * `TRAILER_DICT_INVALID` を返す。呼び出し側は `Result.mapErr` で
 * `TRAILER_DICT_INVALID` のみを文脈別コード（例: `XREF_STREAM_INVALID`）に
 * 再ラップする責務を持つ。
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
      if (!NumberEx.isSafeIntegerAtLeastZero(_root.objectNumber)) {
        return err({
          code: "ROOT_NOT_FOUND",
          message:
            "/Root entry has an invalid object number (must be a non-negative safe integer)",
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
        objectNumber: ObjectNumber.of(_root.objectNumber),
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
      if (_prev) {
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
      if (_info) {
        if (_info.type !== "indirect-ref") {
          return err({
            code: "TRAILER_DICT_INVALID",
            message: "/Info entry is not an indirect reference",
            offset: _infoOffset,
          });
        }
        if (!NumberEx.isSafeIntegerAtLeastZero(_info.objectNumber)) {
          return err({
            code: "TRAILER_DICT_INVALID",
            message:
              "/Info entry has an invalid object number (must be a non-negative safe integer)",
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
        result.info = {
          objectNumber: ObjectNumber.of(_info.objectNumber),
          generationNumber: infoGenResult.value,
        };
      }

      // /ID - optional, must be 2-element array of string objects
      if (_id) {
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

      return ok(result);
    },
  };

  return chain;
}
