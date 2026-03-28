import type { PdfParseError, PdfParseErrorCode } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { ByteOffset as BO, type ByteOffset } from "../../types/byte-offset";
import { GenerationNumber } from "../../types/generation-number";
import type { PdfObject, TrailerDict } from "../../types/index";
import { ObjectNumber } from "../../types/object-number";

interface TrailerDictBuilderChain {
  root(value?: PdfObject, offset?: ByteOffset): TrailerDictBuilderChain;
  size(value?: PdfObject, offset?: ByteOffset): TrailerDictBuilderChain;
  prev(value?: PdfObject, offset?: ByteOffset): TrailerDictBuilderChain;
  info(value?: PdfObject, offset?: ByteOffset): TrailerDictBuilderChain;
  id(value?: PdfObject, offset?: ByteOffset): TrailerDictBuilderChain;
  build(): Result<TrailerDict, PdfParseError>;
}

/**
 * TrailerDict 構築用のクロージャベース Builder を生成する。
 *
 * `/Root`, `/Size` のバリデーション失敗時は固定エラーコードを使用し、
 * オプションフィールド (`/Prev`, `/Info`, `/ID`) のバリデーション失敗時は
 * `optionalFieldErrorCode` で指定されたエラーコードを使用する。
 *
 * @param optionalFieldErrorCode - オプションフィールドのバリデーション失敗時のエラーコード
 * @returns メソッドチェーン可能な TrailerDict ビルダー
 */
export function trailerDictBuilder(
  optionalFieldErrorCode: PdfParseErrorCode,
): TrailerDictBuilderChain {
  let _root: PdfObject | undefined;
  let _rootOffset: ByteOffset | undefined;
  let _size: PdfObject | undefined;
  let _sizeOffset: ByteOffset | undefined;
  let _prev: PdfObject | undefined;
  let _prevOffset: ByteOffset | undefined;
  let _info: PdfObject | undefined;
  let _infoOffset: ByteOffset | undefined;
  let _id: PdfObject | undefined;
  let _idOffset: ByteOffset | undefined;

  return {
    root(value?: PdfObject, offset?: ByteOffset) {
      _root = value;
      _rootOffset = offset;
      return this;
    },
    size(value?: PdfObject, offset?: ByteOffset) {
      _size = value;
      _sizeOffset = offset;
      return this;
    },
    prev(value?: PdfObject, offset?: ByteOffset) {
      _prev = value;
      _prevOffset = offset;
      return this;
    },
    info(value?: PdfObject, offset?: ByteOffset) {
      _info = value;
      _infoOffset = offset;
      return this;
    },
    id(value?: PdfObject, offset?: ByteOffset) {
      _id = value;
      _idOffset = offset;
      return this;
    },
    build(): Result<TrailerDict, PdfParseError> {
      // /Root - required, must be IndirectRef
      if (!_root) {
        return err({
          code: "ROOT_NOT_FOUND",
          message: "/Root entry is missing in trailer dictionary",
        });
      }
      if (
        _root.type !== "indirect-ref" ||
        !Number.isSafeInteger(_root.objectNumber) ||
        !Number.isSafeInteger(_root.generationNumber) ||
        _root.objectNumber < 0 ||
        _root.generationNumber < 0
      ) {
        return err({
          code: "ROOT_NOT_FOUND",
          message: "/Root entry is not an indirect reference",
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
        !Number.isSafeInteger(_size.value as number) ||
        (_size.value as number) < 0
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
          !Number.isSafeInteger(_prev.value as number) ||
          (_prev.value as number) < 0
        ) {
          return err({
            code: optionalFieldErrorCode,
            message: "/Prev entry is not a non-negative integer",
            offset: _prevOffset,
          });
        }
        result.prev = BO.of(_prev.value as number);
      }

      // /Info - optional, IndirectRef
      if (_info) {
        if (
          _info.type !== "indirect-ref" ||
          !Number.isSafeInteger(_info.objectNumber) ||
          !Number.isSafeInteger(_info.generationNumber) ||
          _info.objectNumber < 0 ||
          _info.generationNumber < 0
        ) {
          return err({
            code: optionalFieldErrorCode,
            message: "/Info entry is not an indirect reference",
            offset: _infoOffset,
          });
        }
        const infoGenResult = GenerationNumber.create(_info.generationNumber);
        if (!infoGenResult.ok) {
          return err({
            code: optionalFieldErrorCode,
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
            code: optionalFieldErrorCode,
            message: "/ID entry must be a 2-element array of strings",
            offset: _idOffset,
          });
        }
        const elements = _id.elements;
        if (elements.length !== 2) {
          return err({
            code: optionalFieldErrorCode,
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
              code: optionalFieldErrorCode,
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
}
