import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { parseTrailer } from "../index";

const encoder = new TextEncoder();

function encode(s: string): Uint8Array {
  return encoder.encode(s);
}

function trailerAt(
  content: string,
  offset = 0,
): { data: Uint8Array; offset: ByteOffset } {
  return { data: encode(content), offset: ByteOffset.of(offset) };
}

test("指定オフセットにtrailerキーワードが存在しない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data } = trailerAt("not_trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("offset < 0 の場合にエラーが返る", () => {
  const { data } = trailerAt("trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, ByteOffset.of(-1));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("offset >= data.length の場合にエラーが返る", () => {
  const { data } = trailerAt("trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, ByteOffset.of(data.length));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("trailersのようにキーワード直後が非境界文字の場合にエラーが返る", () => {
  const { data } = trailerAt("trailers << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("xtrailerのようにキーワード直前が非境界文字の場合にエラーが返る", () => {
  const data = encode("xtrailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, ByteOffset.of(1));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/Rootがない辞書に対してROOT_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.message).toContain("/Root");
});

test("/Rootが非間接参照の場合にROOT_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root /Catalog /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.message).toContain("indirect reference");
});

test("/Sizeがない辞書に対してSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("/Size");
});

test("/Sizeが非整数の場合にSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R /Size 1.5 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("non-negative integer");
});

test("/IDが1要素の場合にエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [<abc123>] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("/ID");
});

test("/IDの要素が非文字列の場合にエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [1 2] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("/ID");
});

test("/IDのhex stringに不正な16進文字が含まれる場合にエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [<zz> <00>] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("hex");
});

test("/Prevが負数の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Prev -1 >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/Prevが実数の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Prev 1.5 >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toBe(
    "/Prev entry is not a non-negative integer",
  );
  expect(result.error.offset).toBeDefined();
});

test("/Prevが名前の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Prev /Something >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/XRefStmが負数の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /XRefStm -1 >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/XRefStmが実数の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /XRefStm 1.5 >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toBe(
    "/XRefStm entry is not a non-negative integer",
  );
  expect(result.error.offset).toBeDefined();
});

test("/Infoが非間接参照の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Info /SomeName >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("<<が見つからない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("<<");
});

test(">>が見つからない(EOF到達)場合にエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R /Size 10");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("未知キーの値が未閉鎖の配列の場合にErrが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown [1 2",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("65段ネストの配列でNESTING_TOO_DEEPエラーが返る", () => {
  const depth = 65;
  const open = "[".repeat(depth);
  const close = "]".repeat(depth);
  const { data, offset } = trailerAt(
    `trailer << /Root 1 0 R /Size 10 /Unknown ${open}1${close} >>`,
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("NESTING_TOO_DEEP");
});

test("64段ネストの配列は正常にパースされる", () => {
  const depth = 64;
  const open = "[".repeat(depth);
  const close = "]".repeat(depth);
  const { data, offset } = trailerAt(
    `trailer << /Root 1 0 R /Size 10 /Unknown ${open}1${close} >>`,
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
});

test("エラー発生時のoffsetがファイル内の正しいバイト位置を指している", () => {
  const prefix = "        ";
  const content = `${prefix}trailer << /Size 10 >>`;
  const data = encode(content);
  const result = parseTrailer(data, ByteOffset.of(prefix.length));
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/Root の世代番号が65535超の場合にROOT_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 99999 R /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("/Info の世代番号が65535超の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Info 1 99999 R >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/Encryptが間接参照でも辞書でもない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Encrypt /Foo >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("/Encrypt");
});

test("/Encrypt の世代番号が65535超の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Encrypt 1 99999 R >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/Sizeにboolean値(true)が指定された場合にSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size true /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("/Size");
});

test("/Sizeにboolean値(false)が指定された場合にSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size false /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("/Size");
});

test("/Sizeにnullが指定された場合にSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size null /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("/Size");
});

test("/Sizeに辞書値<< >>が指定された場合にSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size << >> /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("/Size");
});

test("リテラル文字列に0-255範囲外のコードユニット(\\400)が含まれる場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Size 10 /Root 1 0 R /ID [(\\400) (b)] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("outside 0-255");
});

test("値の位置に予期せぬトークン(])が現れた場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size ] /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain(
    "unexpected token at value position in trailer dictionary",
  );
});

test("/Encryptの値が65段ネストの辞書の場合にNESTING_TOO_DEEPエラーが返る", () => {
  const depth = 65;
  const open = "<< /K ".repeat(depth);
  const close = " >>".repeat(depth);
  const { data, offset } = trailerAt(
    `trailer << /Root 1 0 R /Size 10 /Encrypt ${open}1${close} >>`,
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("NESTING_TOO_DEEP");
});

test("/Encryptの値が65段ネストの配列の場合にNESTING_TOO_DEEPエラーが返る", () => {
  const depth = 65;
  const open = "[".repeat(depth);
  const close = "]".repeat(depth);
  const { data, offset } = trailerAt(
    `trailer << /Root 1 0 R /Size 10 /Encrypt ${open}1${close} >>`,
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("NESTING_TOO_DEEP");
});

test("ネストした辞書内で非Nameキーが現れた場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Encrypt << 123 /Standard >> >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain(
    "expected name key in nested dictionary value",
  );
});

test("ネストした辞書内で値の直前にEOFに達した場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Encrypt << /Filter",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("unexpected end of data");
});

test("/IDの値が配列でない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID <00> >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("/ID entry must be an array");
});

test("/IDの要素が3個以上の場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [<00> <00> <00>] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("2-element array");
});

test("/ID要素パース中にデータ末尾(EOF)に達した場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [<00>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain(
    "unexpected end of data while parsing /ID array",
  );
});

test("トップレベルの辞書キーがNameでない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << 123 /Root 1 0 R /Size 10 >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("expected name key");
});

test("トップレベルの辞書値の前にDictEnd(>>)が現れた場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("expected value for key");
});

test("トップレベルの辞書値の前にEOFに達した場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("unexpected end of data");
});

test("スキップ対象辞書内で予期せぬトークン(])が現れた場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown << ] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("unexpected ] while skipping dictionary value");
});

test("スキップ対象辞書内で非Nameキーが現れた場合でもスキップされ正常に処理される", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown << 123 /A 1 >> >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
});

test("スキップ対象辞書内でキー直後にEOFに達した場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown << /A",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("unexpected end of data");
});

test("ネストした辞書内でキー読み取り直前にEOFに達した場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Encrypt <<",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("unexpected end of data while parsing dictionary value");
});

test("スキップ対象の単体数値のプッシュバック処理が正常に動作する", () => {
  const { data, offset } = trailerAt(
    "trailer << /Unknown 1 /Root 1 0 R /Size 10 >>",
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
});

test("スキップ対象で整数が2個連続しRでない場合に2個目の整数がプッシュバックされトップレベルキー不正で失敗する", () => {
  const { data, offset } = trailerAt(
    "trailer << /Unknown 1 2 /Root 1 0 R /Size 10 >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("expected name key in trailer dictionary");
});
