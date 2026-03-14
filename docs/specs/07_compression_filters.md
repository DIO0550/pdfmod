# 07. データ圧縮とストリームフィルタ

## 1. 概要

PDF内のストリームオブジェクトは、ファイルサイズの最適化のために圧縮アルゴリズムを利用する。圧縮・展開のメカニズムは、ストリーム辞書の `/Filter` キーによって管理される。

## 2. フィルタの指定方法

### 2.1 単一フィルタ

```
<< /Length 1234
   /Filter /FlateDecode
>>
stream
... (圧縮データ) ...
endstream
```

### 2.2 カスケード（多段）フィルタ

フィルタを配列で指定し、パイプライン処理を構築する。

```
<< /Length 1234
   /Filter [/ASCII85Decode /FlateDecode]
   /DecodeParms [null << /Predictor 12 /Columns 4 >>]
>>
stream
... (ASCII85エンコード + Flate圧縮されたデータ) ...
endstream
```

#### デコード処理の順序

```
エンコードされたデータ
  → /ASCII85Decode (ASCII85をバイナリに変換)
  → /FlateDecode (DEFLATEで解凍)
  → 元のデータ
```

**重要**: 配列の**先頭から順番に**デコードを適用する。

### 2.3 DecodeParms

フィルタのパラメータを辞書で指定する。複数フィルタの場合は配列で対応。

```
/DecodeParms << /Predictor 12 /Columns 4 >>

または（複数フィルタ時）:
/DecodeParms [null << /Predictor 12 /Columns 4 >>]
```

パラメータが不要なフィルタには `null` を指定。

## 3. 標準フィルタ一覧

### 3.1 /FlateDecode

**最も重要で普遍的なフィルタ**。

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | zlib/DEFLATE (RFC 1950/1951) |
| 用途 | テキストストリーム、オブジェクトストリーム、画像データ等の汎用圧縮 |
| 圧縮タイプ | 可逆圧縮 |
| 実装 | zlib等の外部ライブラリと連携 |

#### DecodeParms

| キー | 型 | デフォルト | 説明 |
|:-----|:---|:-----------|:-----|
| `/Predictor` | 整数 | 1 | 予測子アルゴリズム |
| `/Colors` | 整数 | 1 | 1サンプルあたりのカラーコンポーネント数 |
| `/BitsPerComponent` | 整数 | 8 | 1コンポーネントあたりのビット数 |
| `/Columns` | 整数 | 1 | 1行あたりのサンプル数 |
| `/EarlyChange` | 整数 | 1 | LZW用（FlateDecodeでは無視） |

#### Predictor 値

| 値 | 説明 |
|:---|:-----|
| 1 | 予測子なし（デフォルト） |
| 2 | TIFF Predictor 2 |
| 10 | PNG None |
| 11 | PNG Sub |
| 12 | PNG Up |
| 13 | PNG Average |
| 14 | PNG Paeth |
| 15 | PNG Optimum（各行で最適な予測子を選択） |

#### PNG予測子の実装

```
Predictor ≥ 10 の場合、各行の先頭バイトが予測子タイプを示す:

fn apply_png_predictor(data: &[u8], columns: usize, components: usize) -> Vec<u8> {
    let bpp = components;  // bytes per pixel (simplified)
    let row_size = columns * bpp;
    let mut result = Vec::new();
    let mut prev_row = vec![0u8; row_size];

    for row in data.chunks(row_size + 1) {
        let predictor_type = row[0];
        let row_data = &row[1..];
        let mut decoded_row = vec![0u8; row_size];

        for i in 0..row_size {
            let a = if i >= bpp { decoded_row[i - bpp] } else { 0 };     // left
            let b = prev_row[i];                                          // above
            let c = if i >= bpp { prev_row[i - bpp] } else { 0 };        // upper-left

            decoded_row[i] = match predictor_type {
                0 => row_data[i],                                         // None
                1 => row_data[i].wrapping_add(a),                         // Sub
                2 => row_data[i].wrapping_add(b),                         // Up
                3 => row_data[i].wrapping_add(((a as u16 + b as u16) / 2) as u8), // Average
                4 => row_data[i].wrapping_add(paeth_predictor(a, b, c)),  // Paeth
                _ => row_data[i],
            };
        }

        result.extend_from_slice(&decoded_row);
        prev_row = decoded_row;
    }
    result
}

fn paeth_predictor(a: u8, b: u8, c: u8) -> u8 {
    let p = a as i32 + b as i32 - c as i32;
    let pa = (p - a as i32).abs();
    let pb = (p - b as i32).abs();
    let pc = (p - c as i32).abs();
    if pa <= pb && pa <= pc { a }
    else if pb <= pc { b }
    else { c }
}
```

### 3.2 /LZWDecode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | Lempel-Ziv-Welch 辞書ベース圧縮 |
| 用途 | 古いPDFファイルでの汎用圧縮 |
| 圧縮タイプ | 可逆圧縮 |
| 備考 | GIF画像と同等のアルゴリズム。現在はFlateDecodeが主流 |

#### DecodeParms

`/FlateDecode` と同じパラメータに加え:

| キー | 型 | デフォルト | 説明 |
|:-----|:---|:-----------|:-----|
| `/EarlyChange` | 整数 | 1 | 1: コードサイズ拡張のタイミングが早い、0: 標準 |

### 3.3 /ASCII85Decode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | ASCII base-85 エンコーディング |
| 用途 | バイナリデータをASCII文字に変換 |
| 圧縮タイプ | エンコーディング（サイズは約25%増加） |
| 終端マーカー | `~>` |

#### エンコーディング仕様

```
変換規則:
- 4バイトのバイナリ → 5文字のASCII（文字コード33〜117、つまり '!' 〜 'u'）
- 4バイトすべてが0の場合 → 'z'（1文字に短縮）
- 最終グループが4バイト未満の場合はパディング

デコード:
- ストリーム終端は '~>' で示される
- ホワイトスペースは無視
```

### 3.4 /ASCIIHexDecode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | 16進数エンコーディング |
| 用途 | バイナリデータを16進数文字に変換 |
| 圧縮タイプ | エンコーディング（サイズは100%増加） |
| 終端マーカー | `>` |

```
変換規則:
- 1バイト → 2文字の16進数
- ホワイトスペースは無視
- 奇数桁の場合は末尾に0を補完
- ストリーム終端は '>' で示される
```

### 3.5 /DCTDecode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | JPEG (Joint Photographic Experts Group) |
| 用途 | 写真等の自然画像の圧縮 |
| 圧縮タイプ | 非可逆圧縮（品質設定による） |
| 備考 | ストリームデータはJPEGファイルそのもの |

#### DecodeParms

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/ColorTransform` | 整数 | 色変換の適用: 0=なし、1=YCbCrに変換 |

#### 実装上の注意点
- ストリームデータをそのままJPEGデコーダに引き渡すことが可能
- JPEG のSOFマーカーから画像サイズ・色空間情報を取得可能
- CMYKのJPEG画像は色変換に注意が必要

### 3.6 /JPXDecode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | JPEG 2000 |
| 用途 | 高品質画像の圧縮（可逆/非可逆選択可能） |
| 圧縮タイプ | 可逆または非可逆 |
| 導入 | PDF 1.5 |

### 3.7 /CCITTFaxDecode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | CCITT Group 3/4 ファクシミリ規格 |
| 用途 | 1ビットモノクロ画像の圧縮 |
| 圧縮タイプ | 可逆圧縮 |
| 備考 | スキャン文書のアーカイブに多用 |

#### DecodeParms

| キー | 型 | デフォルト | 説明 |
|:-----|:---|:-----------|:-----|
| `/K` | 整数 | 0 | <0: Group 4、=0: Group 3 1D、>0: Group 3 混合 |
| `/EndOfLine` | ブール | false | 行末コードの有無 |
| `/EncodedByteAlign` | ブール | false | バイトアラインメントの有無 |
| `/Columns` | 整数 | 1728 | 1行あたりのピクセル数 |
| `/Rows` | 整数 | 0 | 行数（0=不定） |
| `/EndOfBlock` | ブール | true | ブロック終端コードの有無 |
| `/BlackIs1` | ブール | false | true: 1=黒、false: 0=黒 |
| `/DamagedRowsBeforeError` | 整数 | 0 | エラー前に許容される破損行数 |

### 3.8 /JBIG2Decode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | JBIG2 |
| 用途 | モノクロ画像の高効率圧縮 |
| 圧縮タイプ | 可逆または非可逆 |
| 導入 | PDF 1.4 |
| 備考 | CCITTよりも高い圧縮率を実現 |

#### DecodeParms

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/JBIG2Globals` | ストリーム | グローバルシンボル辞書 |

### 3.9 /RunLengthDecode

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | Run-Length Encoding |
| 用途 | 単純なバイト列の圧縮 |
| 圧縮タイプ | 可逆圧縮 |
| 終端マーカー | バイト値 128 (0x80) |

```
デコード規則:
- length (0〜127): 次の1バイトを (length + 1) 回繰り返す
- length (129〜255): 次の (257 - length) バイトをそのまま出力
- length = 128: ストリーム終端
```

### 3.10 /Crypt

| 項目 | 詳細 |
|:-----|:-----|
| アルゴリズム | 暗号化フィルタ |
| 用途 | ストリームデータの暗号化/復号 |
| 導入 | PDF 1.5 |
| 備考 | 他のフィルタと組み合わせて使用 |

## 4. オブジェクトストリーム（Object Streams）

### 4.1 概要

PDF 1.5で導入された構造圧縮の仕組み。複数のインダイレクトオブジェクトを1つのストリーム内にまとめてFlate圧縮する。

```
30 0 obj
<< /Type /ObjStm
   /N 5
   /First 40
   /Length 500
   /Filter /FlateDecode
>>
stream
1 0 2 20 3 35 4 50 5 65    % オフセットテーブル: obj_num offset pairs
<< /Type /Catalog /Pages 2 0 R >>   % オブジェクト1の内容
<< /Type /Pages /Kids [3 0 R] /Count 1 >>   % オブジェクト2の内容
... (以降のオブジェクト) ...
endstream
endobj
```

### 4.2 ObjStm辞書のエントリ

| キー | 型 | 必須 | 説明 |
|:-----|:---|:-----|:-----|
| `/Type` | 名前 | **必須** | `/ObjStm` |
| `/N` | 整数 | **必須** | 格納されているオブジェクトの数 |
| `/First` | 整数 | **必須** | 最初のオブジェクトデータの開始バイトオフセット |
| `/Extends` | 間接参照 | 任意 | 拡張元のオブジェクトストリーム |

### 4.3 内部構造

```
デコード後のデータ:
+------------------------------------+-------------------------------+
| オフセットテーブル (N*2個の整数)     | オブジェクトデータ              |
| obj_num1 offset1 obj_num2 offset2  | << /Type /Catalog ... >>      |
| ...                                | << /Type /Pages ... >>        |
+------------------------------------+-------------------------------+
                                     ^
                                     /First の位置
```

#### オフセットテーブルのパース

```
fn parse_object_stream(data: &[u8], n: usize, first: usize) -> Vec<(u32, PdfObject)> {
    let header = &data[..first];
    let body = &data[first..];

    // ヘッダからオブジェクト番号とオフセットのペアを読み取る
    let pairs: Vec<(u32, usize)> = parse_int_pairs(header, n);

    pairs.iter().map(|(obj_num, offset)| {
        let obj_data = &body[*offset..];
        let object = parse_pdf_object(obj_data);
        (*obj_num, object)
    }).collect()
}
```

### 4.4 制約事項

- **ストリームオブジェクト自体**はオブジェクトストリーム内に格納できない
- オブジェクトストリーム内のオブジェクトの**世代番号は常に0**
- XRefストリームからの参照はType=2エントリで行う

### 4.5 XRefストリームとの連携

```
XRefストリームのType=2エントリ:
  Field1 (type) = 2
  Field2 = オブジェクトストリームのオブジェクト番号
  Field3 = ストリーム内のインデックス

オブジェクト取得手順:
1. XRefからType=2エントリを取得
2. Field2で指定されたオブジェクトストリームを解凍
3. オフセットテーブルをパース
4. Field3のインデックスに対応するオブジェクトを取り出す
```

## 5. フィルタパイプラインの実装

```
fn decode_stream(stream: &PdfStream) -> Result<Vec<u8>> {
    let mut data = stream.raw_data().to_vec();
    let filters = stream.get_filter_list();
    let params = stream.get_decode_params_list();

    for (i, filter) in filters.iter().enumerate() {
        let param = params.get(i).cloned().unwrap_or(None);
        data = match filter.as_str() {
            "/FlateDecode" => flate_decode(&data, param.as_ref())?,
            "/LZWDecode" => lzw_decode(&data, param.as_ref())?,
            "/ASCII85Decode" => ascii85_decode(&data)?,
            "/ASCIIHexDecode" => ascii_hex_decode(&data)?,
            "/DCTDecode" => data,  // JPEGデータはそのまま保持
            "/JPXDecode" => data,  // JPEG2000データはそのまま保持
            "/CCITTFaxDecode" => ccitt_decode(&data, param.as_ref())?,
            "/JBIG2Decode" => jbig2_decode(&data, param.as_ref())?,
            "/RunLengthDecode" => rle_decode(&data)?,
            "/Crypt" => crypt_decode(&data, param.as_ref())?,
            _ => return Err(Error::UnsupportedFilter(filter.clone())),
        };
    }

    Ok(data)
}
```
