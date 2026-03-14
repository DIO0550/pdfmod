# **PDFフォーマットの内部構造とライブラリ開発のための仕様解説**

## **1\. 概要と標準化の歴史**

Portable Document Format（PDF）は、作成元の環境、アプリケーション、またはOSに依存することなく、電子ドキュメントを確実かつ忠実に交換および表示するために設計された、デバイス非依存のデータ構造フォーマットである。1990年代初頭にアドビシステムズ（現アドビ）によって、PostScriptページ記述言語を基盤として開発されたこのフォーマットは、安全で信頼性の高い情報交換のための世界的なデファクトスタンダードとして定着した 1。長らくアドビの独自仕様であったが、2007年に仕様の完全な管理権が国際標準化機構（ISO）に譲渡され、PDF 1.7が「ISO 32000-1:2008」として国際標準化された 1。さらに近年では、時代遅れの機能の非推奨化、最新の暗号化アルゴリズムの採用、およびアクセシビリティ（タグ付きPDF）の強化を図ったメジャーアップデートとして「ISO 32000-2:2020（PDF 2.0）」が発行されている 4。

PDFを生成、操作、またはレンダリングするためのソフトウェアライブラリをゼロから構築しようとする開発者やシステムアーキテクトにとって、700ページを超えるISO 32000仕様書を解読し実装することは極めて難易度の高いエンジニアリング課題である 6。その最大の理由は、PDFがJSONやXMLのような単純なシリアライズデータや、HTMLのような上から下へ順次解析できるマークアップ言語ではないためである。PDFは本質的に、ランダムアクセスを前提としたインデックス付きのバイナリエンコードされた「グラフィカルオブジェクトのデータベース」として機能する 8。仕様書では、PDFファイルを読み込んで画面表示やインタラクションを提供するソフトウェアを「適合リーダー（conforming readers）」、PDFファイルを生成するソフトウェアを「適合ライター（conforming writers）」、そしてその両方の機能を備えたものを「適合製品（conforming products）」と定義しており、ライブラリ開発においてはいずれの適合性を満たすかを明確に定義した上でアーキテクチャを設計する必要がある 1。本レポートでは、字句解析のルールから、論理的なドキュメントツリーの構築、高度なタイポグラフィの制御、そしてストリームの圧縮機構に至るまで、PDFエコシステムの内部構造を網羅的に解析し、堅牢なPDFライブラリを実装するための技術的な設計図を提供する。

## **2\. レキシカル規約とプリミティブデータ型**

PDFファイルの解析における最下層の処理は、入力されるバイトストリームを適切なトークンに分割する字句解析（レキシカルスキャナ）の実装である。PDFの構文はPostScriptから強く影響を受けており、ファイル内のバイトは「ホワイトスペース（トークンを区切るための文字）」「デリミタ（トークンを構築するための特殊文字）」「通常の文字」の3つに厳密に分類される 11。ライブラリのパーサーは、バイトストリームを読み込みながら、仕様で定義されている以下の9種類のプリミティブ（基本）データ型へと安全にマッピングしなければならない 7。

| データ型 | 構文の例 | ライブラリ実装における解析のポイント |
| :---- | :---- | :---- |
| Nullオブジェクト | null | 値が存在しないこと、または継承された辞書のエントリを明示的に削除（クリア）するために使用されるキーワードである 7。 |
| ブール値 | true または false | 論理値を表すキーワード。フラグの制御などに用いられる 7。 |
| 数値 | 123, \-45.6 | 整数と実数の両方をサポートする。仕様上、指数表記（例：1.23e4）は許可されていないため、パーサーは指数表記に遭遇した場合に厳格なエラーを投げるか、フォールバックとして許容するヒューリスティックを実装する必要がある 7。 |
| 文字列 (リテラル) | (Hello World) | 括弧で囲まれる。改行や括弧自体を含める場合はバックスラッシュ（\\）によるエスケープ処理が必要となる 7。 |
| 文字列 (16進数) | \<48656C6C6F\> | 山括弧で囲まれ、各文字ペアが1バイトを表す。解析時にバイト列に直接デコードされる 11。 |
| 名前 (Name) | /Type | スラッシュ（/）で始まるアトミックなシンボルであり、主に辞書のキーとして使用される。名前に空白などの特殊文字を含める場合は、ハッシュ記号を用いた16進数エスケープ（例：/Hello\#20World）を行う必要がある 7。 |
| 配列 (Array) | \`\` | 角括弧で囲まれたオブジェクトの順序付きリスト。要素間に特定のデリミタは不要（空白で区切る）。配列内には異なるデータ型を混在させることができ、任意の深さでネスト可能である 7。 |
| 辞書 (Dictionary) | \<\< /Key /Val \>\> | 二重の山括弧で囲まれたキーと値のペアのコレクション。PDFにおける最も重要なデータ構造。キーは必ず「名前（Name）」オブジェクトでなければならないが、値には任意のデータ型（配列や別の辞書を含む）を指定できる 7。 |
| ストリーム (Stream) | stream... endstream | 辞書とそれに続く任意のバイナリデータの組み合わせ。画像ピクセルや圧縮されたページコンテンツを格納する。ストリームの前の辞書には、必ずデータの正確なバイト数を示す/Lengthキーが含まれていなければならない 7。 |

### **ダイレクトオブジェクトとインダイレクトオブジェクトの分離**

PDFパーサーのアーキテクチャを決定づける重要な概念が、「ダイレクトオブジェクト」と「インダイレクト（間接）オブジェクト」の区別である。ダイレクトオブジェクトは、配列内や辞書内に直接インラインで記述される（例：\[1 2 3\]） 10。一方、インダイレクトオブジェクトは、ファイル内の任意の場所から参照できるように、一意の識別子（オブジェクト番号）と世代番号（ジェネレーション番号）を付与され、objとendobjというキーワードでカプセル化される 7。

例えば、あるページオブジェクトが次のように定義されたとする。

12 0 obj \<\< /Type /Page /Contents 15 0 R \>\> endobj

ここでは、オブジェクト番号12、世代番号0の辞書オブジェクトが定義されている。このオブジェクト内で使用されている 15 0 R という構文が「インダイレクト参照（Indirect Reference）」である 7。これは「オブジェクト番号15、世代番号0のオブジェクトをここで展開せよ」というポインタとして機能する。この間接参照のメカニズムにより、PDFはデータの重複を徹底的に排除している。例えば、ドキュメント内で使用される巨大なフォントファイルや企業ロゴの画像データは、一度だけインダイレクトオブジェクトとしてファイル内に格納され、何千ページもの各ページ辞書から同一のオブジェクト番号を用いて参照される。ライブラリ開発においては、このインダイレクト参照を解決するためのメモリ効率の良いグラフ構造のトラバーサル（巡回）メカニズムや、不要なオブジェクトの多重読み込みを防ぐキャッシュ戦略の実装が不可欠となる 11。

## **3\. 物理ファイル構造とランダムアクセス機構**

有効なPDFファイルは、物理的に「ヘッダ（Header）」「ボディ（Body）」「相互参照テーブル（Cross-Reference Table / xref）」「トレイラ（Trailer）」の4つの主要なセグメントから構成される 7。テキストファイルのようにファイルの先頭から末尾へ順に読み進めるストリーム処理のアプローチでライブラリを実装することは、パフォーマンス上不可能に近い。PDFはファイル末尾から逆方向に解析を開始し、必要なオブジェクトのバイトオフセットを特定してファイル内をシーク（ランダムアクセス）する設計となっている 9。

### **ファイルヘッダ**

ファイルの先頭には、そのファイルが準拠しているPDFのバージョンを示すヘッダ（例：%PDF-1.7 や %PDF-2.0）が配置される 15。しかしながら、ファイルヘッダのバージョン宣言は必ずしも絶対的なものではない。仕様では、ドキュメントカタログ辞書内の /Version エントリに格納された値が、ヘッダのバージョン指定を上書き（オーバーライド）することが認められている 17。したがって、ライブラリはヘッダのバージョンのみを信用するのではなく、DOMのルートを解析した後に最終的なバージョンを確定させなければならない。さらに、バイナリデータストリームをサポートするために、ヘッダの直後にはASCIIコード127を超える非印字文字（高ビット文字）を4バイト以上含むコメント行が配置されることが多い 19。これにより、FTPなどのファイル転送プロトコルに対して、このファイルがプレーンテキストではなくバイナリデータであることを通知し、意図しない改行コードの変換等によるファイルの破損を防いでいる。

### **相互参照テーブル（Xrefテーブル）**

ボディ部分には無数のインダイレクトオブジェクトが散在しているが、パーサーがそれらを逐一検索することは計算量（時間計算量）の観点から非現実的である。この問題を解決するのが相互参照テーブル（xrefテーブル）である 7。xrefテーブルは、ファイル内に存在するすべてのインダイレクトオブジェクトが、ファイルの先頭から何バイト目に位置しているか（バイトオフセット）を記録した絶対的なルックアップインデックスである 7。

従来のPDFフォーマットにおけるxrefテーブルは、xrefというキーワードから始まり、人間が可読なプレーンテキストとして記録される 15。各エントリは厳密に20バイト長の固定長フォーマットで構成される。

| 要素 | 構文フォーマット | 詳細な目的と動作 |
| :---- | :---- | :---- |
| オフセット | nnnnnnnnnn | ファイルの先頭（0バイト目）から対象オブジェクトのobjキーワードが開始する位置までの正確なバイト数。 |
| 世代番号 | ggggg | オブジェクトの世代を示す番号。オブジェクトが削除され、そのオブジェクト番号が再利用される際にインクリメントされる。通常、使用中のオブジェクトは00000である 15。 |
| 状態フラグ | n または f | n (in-use) はそのオブジェクトが有効であることを示す。f (free) はそのオブジェクトが削除された空きスロットであることを示す 15。 |

テーブルの最初のエントリ（オブジェクト番号0）は、常に世代番号が65535の空き（f）オブジェクトとして定義され、ファイル内のすべての空きオブジェクトを繋ぐ連結リストのヘッドとして機能する 9。

また、PDF 1.5以降の仕様では、ファイルサイズを劇的に圧縮するために「XRefストリーム（XRef Streams）」という概念が導入された 11。これは、プレーンテキストのテーブルの代わりに、ストリームオブジェクト内のバイナリデータとして相互参照データをFlate圧縮して格納するものである 11。最新の仕様に準拠するPDFライブラリを開発する場合、従来のテキストベースのxrefテーブルと、バイナリベースのXRefストリームの両方をシームレスに解析・結合できる抽象化レイヤの実装が必須要件となる。

### **トレイラ辞書（Trailer Dictionary）と解析の開始点**

PDFビューアや解析ライブラリがファイルを開く際、最初に読み込むのはファイルの先頭ではない。ファイルの末尾（End-Of-Fileを示す %%EOF マーカー）からファイルの上部に向かってスキャンを行い、startxref というキーワードを探索する 9。startxref の直後にある数値が、相互参照テーブルの開始位置を示す正確なバイトオフセットである。そして、そのすぐ上部には trailer キーワードで始まる「トレイラ辞書」が配置されている 15。

トレイラ辞書は、ドキュメント全体を解釈するためのエントリーポイント（地図）として機能し、以下の重要なキーを含む 9。

* /Root: ドキュメントのルート要素である「ドキュメントカタログ」へのインダイレクト参照 7。  
* /Size: 相互参照テーブルに含まれるエントリの総数 9。  
* /Info: ドキュメントのメタデータ（作成者、作成日時など）を格納した辞書への参照 18。  
* /ID: ファイルを暗号化したり、一意に識別したりするために使用される2つの16バイト暗号化ハッシュ文字列の配列 9。PDF 2.0ではこの記述が厳格化されている。

ライブラリは、トレイラ辞書を解析し、startxref の位置からxrefテーブルを読み込んでメモリ上にインデックスを構築し、/Root の参照を辿ることで、初めてドキュメントの論理的な解析（DOMの構築）を開始することができる 9。

## **4\. 論理ドキュメントアーキテクチャとページツリー**

物理ファイルのインデックス構造が解決されると、次はオブジェクト間の参照関係からなる論理的なドキュメント構造が展開される。PDFの論理構造は、ドキュメントカタログ（Document Catalog）を頂点とする有向非巡回グラフ（DAG）としてモデリングされている 10。

### **ドキュメントカタログとページツリーの走査**

/Root エントリからアクセスされるドキュメントカタログは、ドキュメント全体のグローバルな設定を保持する 9。ここには、ユーザーの画面表示設定（ビューアプレファレンス）、アウトライン（しおり/ブックマーク）、名前付き宛先、アクセスビリティのためのタグ構造、そして何よりも重要な「ページツリー（Page Tree）」への参照が含まれている 9。

ページツリーは、ドキュメント内のすべてのページを管理するデータ構造である。数百から数万ページに及ぶドキュメントを高速に読み込み、特定のページへ即座にジャンプできるようにするため、ページオブジェクトは単なる一次元配列（フラットなリスト）ではなく、平衡木（Balanced Tree）に似た階層構造で編成されている 10。ページツリーのルートや中間ノードは /Type /Pages という辞書であり、その子ノードのリストを保持する /Kids 配列と、そのノードの配下にある末端ページの総数を示す /Count 整数を含んでいる 9。/Kids 配列の要素は、さらに下位の /Pages 枝ノードへの参照であるか、実際のページを表す /Page 葉ノードへの参照のいずれかとなる 23。

末端のページオブジェクト（/Type /Page）は、1枚のページを描画するために必要なすべての情報をカプセル化した辞書である。この辞書には、ツリーの上位ノードへの逆参照である /Parent、ページの物理的な寸法（PostScriptポイント単位）を定義する /MediaBox、描画に使用されるリソースを定義する /Resources、そして実際の描画命令が格納されたストリームへの参照である /Contents が必須要件として含まれる 9。

### **ページ属性の継承メカニズムとその落とし穴**

PDFライブラリの実装において、開発者が最も頻繁に陥るアーキテクチャ上の罠が「ページ属性の継承（Resource Inheritance）」メカニズムの処理である。ISO 32000仕様によれば、/MediaBox や /Resources といった一部の重要な属性は、必ずしも各 /Page 辞書内に直接定義されている必要はない。もし末端のページオブジェクトにこれらの属性が欠落している場合、パーサーはページツリーの階層を /Parent 参照に従って上方に遡り、祖先ノード（/Pages）に定義されている属性を見つけてそれを継承（フォールバック）しなければならないと定められている 2。

ライブラリがページに新しいテキストやフォントを追加しようとする際、この継承ルールを無視して実装すると深刻なドキュメント破損を引き起こす。例えば、あるページの /Resources 辞書を取得しようとして存在しなかった場合、安易に新しい空の /Resources 辞書をそのページオブジェクトに直接作成してしまうと、それまで祖先ノードから継承されていた既存のフォント、画像、グラフィックステートの定義がすべてシャドウイング（隠蔽）されて消失してしまう 24。これを防ぐため、適合ライター（ライブラリ）は、属性を変更する前に必ずツリー全体を遡って継承された属性を明示的に取得し、必要に応じてローカルにディープコピーした上でリソースを追加するような堅牢なトラバーサルアルゴリズムを実装しなければならない 24。

## **5\. リソース辞書とグラフィックスステート**

ページ辞書内に存在する /Resources 辞書は、後述するコンテンツストリーム（描画命令）内で使用されるローカルな識別名（文字列）と、ファイル内の任意の場所に存在するグローバルなインダイレクトオブジェクトとを紐づけるローカルなルックアップテーブルとして機能する 14。例えば、コンテンツストリーム内で「/F1 という名前のフォントを使って描画せよ」「/Im0 という画像を配置せよ」という命令があった場合、パーサーは即座にリソース辞書を参照し、/F1 や /Im0 がどのオブジェクト番号を指しているかを解決する 9。

リソース辞書は、扱うリソースの種類に応じて以下のサブ辞書に分割されている 26。

| リソースキー | 格納データ型 | 目的と実装要件 |
| :---- | :---- | :---- |
| /Font | 辞書 | ストリーム内のフォント識別名（例：/F1）を、実際のフォント辞書オブジェクトにマッピングする 10。 |
| /XObject | 辞書 | 外部オブジェクト（External Objects）をマッピングする。これには、ラスタ画像（/Image）や、カプセル化された再利用可能なベクター図形ストリーム（/Form）が含まれる 27。 |
| /ExtGState | 辞書 | 拡張グラフィックステート（Extended Graphics State）をマッピングする。透明度のアルファブレンド、オーバープリント制御、ソフトマスクなど、単一のオペレータでは表現できない複雑な描画状態を辞書として定義する 27。 |
| /ColorSpace | 辞書 | デバイス非依存の色空間（ICCプロファイルやインデックスカラーテーブルなど）の定義をマッピングする 27。 |
| /Pattern | 辞書 | 高度なタイリングや網掛け描画に使用されるパターンオブジェクトを定義する 27。 |
| /Shading | 辞書 | スムーズな階調表現（グラデーション）を定義するシェーディング辞書をマッピングする 27。 |
| /ProcSet | 配列 | 過去のPostScript環境との互換性のために用意された文字列の配列（例：\`\`）。モダンなPDFプロセッサでは実質的に無視されるが、仕様上の互換性のために生成時は含めることが推奨される場合がある 10。 |

## **6\. コンテンツストリームと描画オペレータ**

PDFページの視覚的な構成は、すべてコンテンツストリーム（/Contents）内にバイナリエンコードされた命令群として記述される。このストリームのペイロードを展開すると、数値や名前などの「オペランド（引数）」と、それに対する命令である「オペレータ」のシーケンスが出現する。PDFのオペレータ構文はPostScriptから受け継いだ「後置記法（逆ポーランド記法）」を採用しており、ライブラリは仮想的なスタックマシンを実装してこれを評価しなければならない 8。すなわち、パーサーがオペランドを読み込むと内部スタックにプッシュし、オペレータが出現した時点でスタックから必要な数のオペランドをポップして処理を実行する 8。HTMLやJavaScriptとは異なり、このコンテンツストリームにはループ構文（for/while）や条件分岐（if）、変数の宣言などは一切存在せず、絶対的なグラフィック描画命令の羅列となっている 8。

### **グラフィックスステートの保存と復元**

複雑な図形やテキストをページに重ねてレンダリングするため、ライブラリは状態を保持する「グラフィックスステートマシン」を実装する必要がある。このステートは、現在の変換行列（CTM）、線の太さ、ストローク（輪郭）色、フィル（塗り）色、クリッピングパス、現在のフォントなどを常に記憶している 22。

異なる図形を描画するたびにステートが互いに干渉するのを防ぐため、ストリーム内では頻繁に q（グラフィックスステートの保存）と Q（グラフィックスステートの復元）というオペレータが使用される 8。これらは、現在の状態全体をより深いスタックにプッシュ/ポップする。一般的なストリームのイディオムは以下の通りである。 q (状態を保存) → cm (変換行列を適用) → /Im1 Do (画像を描画) → Q (状態を復元し、前の行列に戻す) 8。

### **座標系とアフィン変換行列**

PDFのデフォルトのユーザー空間座標系は、一般的なコンピュータグラフィックス（左上が原点）とは異なり、ページの「左下」が原点 (0, 0\) となる数学的な直交座標系を採用している 19。ライブラリは、図形や画像を正しい位置・サイズ・角度で描画するために、cm（Concatenate Matrix）オペレータを用いて「カレント変換行列（Current Transformation Matrix: CTM）」を操作する 8。cm オペレータは6つのオペランド a b c d e f を消費し、これを2Dアフィン変換行列として現在のCTMに乗算する。数学的には以下の行列式で表される。

![][image1]  
これにより、移動（Translate）、拡大縮小（Scale）、回転（Rotate）、およびせん断（Skew）のすべての幾何学的変形を単一の計算パスで処理している 8。

### **パスの構築と描画オペレータ**

PDFは「円を描く」「四角形を描く」といった高レベルなプリミティブ命令を直接持たない。代わりに、ライブラリは以下の低レベルなパス構築オペレータを使用して、メモリ上に数学的なパス（軌跡）を定義しなければならない 31。

* m: カレントポイントを指定した座標 ![][image2] に移動する（描画は行わない） 31。  
* l: カレントポイントから指定した座標まで直線のパスを追加する 31。  
* c: 現在の位置と、3つの制御点を用いて3次ベジェ曲線のパスを追加する 31。  
* h: 現在の位置からパスの始点に向かって直線を引いてパスを閉じる（クローズする） 31。

これらのオペレータはメモリ上にパスを構築するだけであり、この時点では画面には何も描画されない。パスを視覚化するためには、以下のペイントオペレータを呼び出す必要がある 31。

* S: 構築されたパスに沿って線を描画する（ストローク） 33。  
* f: 非ゼロワインディング規則（Non-zero winding rule）に基づいて、パスの内部を塗りつぶす（フィル） 33。  
* B: ストロークとフィルの両方を同時に実行する 33。  
* W: 描画の代わりに、構築したパスを以降の描画領域を制限する「クリッピングパス」として設定する 28。

### **色指定オペレータ**

PDFストリーム内では色空間の切り替えと色の指定が頻繁に行われる。ストローク（輪郭）とフィル（塗り）の色は完全に独立して管理されており、大文字のオペレータがストローク、小文字のオペレータがフィルに対応する 28。

* RG / rg: デバイスRGB色空間に切り替え、3つのオペランド（R, G, B）で色を設定する 28。  
* K / k: デバイスCMYK色空間に切り替え、4つのオペランド（C, M, Y, K）で色を設定する 28。  
* CS / cs: リソース辞書で定義された複雑な名前付き色空間（例：特色やICCプロファイル）を指定する 14。

### **テキストのレイアウトと文字列の描画**

PDFパーサーの開発において最も数学的かつ構造的な複雑さを伴うのが、テキストレンダリングの実装である。テキストブロックは、必ず BT（Begin Text）と ET（End Text）という一対のオペレータによって囲まれ、このブロック内で専用のテキスト変換行列が初期化される 10。

テキストブロック内では、以下の主要なテキストオペレータが使用される。

* Tf: 使用するフォントの識別名（例：/F1）とフォントサイズ（ポイント単位）を指定する 10。  
* Td: テキストの挿入位置を行列に従って移動させる 10。  
* Tj: 指定された文字列のバイト列を消費し、現在のフォント設定に従ってグリフを描画する 9。

例えば、ストリーム内の BT /F1 24 Tf 72 720 Td (Potato) Tj ET という記述は、「テキストブロックを開始し、リソース辞書の /F1 フォントを24ポイントのサイズで設定し、座標 (72, 720\) へ移動した後、"Potato" という文字列のグリフを描画してテキストブロックを終了する」という一連の処理を実行する 9。

## **7\. タイポグラフィと複雑なフォント管理アーキテクチャ**

ライブラリ開発者がPDFを深く理解する上で最大の壁となるのが、PDFのフォントアーキテクチャである。PDFにおいては、ストリーム内に記述されたバイトコード（例えば (Potato) という文字列）は、我々が認識するセマンティックなテキスト（Unicodeなど）を直接意味しているわけではなく、単にフォントファイル内の特定の「グリフ（図形）」を指定するためのインデックスキーに過ぎない 37。

### **単純フォント（Simple Fonts）**

初期のPDFや欧文を中心としたドキュメントでは「単純フォント」が使用される。単純フォントは、ストリーム内の文字列を「1バイト＝1文字（グリフ）」として処理する。つまり、論理的には最大256個のグリフしかマッピングできない 39。

* **Type 1**: 古典的なAdobe PostScript技術に基づき、3次ベジェ曲線を用いてグリフを定義する形式 40。  
* **TrueType**: 2次ベジェ曲線を用いる形式で、PDF内で辞書としてラップされて組み込まれる 40。  
* **Type 3**: 非常に特殊なフォント形式であり、グリフの形状が外部のフォントファイルではなく、PDFのコンテンツストリームで使われる描画オペレータの羅列として直接定義される。これにより、文字自体に複数の色を使ったり、複雑な図形を埋め込んだりすることが可能となる 33。

単純フォントの文字エンコーディングは、フォント辞書内の /Encoding エントリ（例：MacRomanEncoding や WinAnsiEncoding）によって制御される 45。しかし、256文字という制限は、日本語、中国語、韓国語（CJK）のような数万の文字を持つ言語環境や、巨大なUnicode空間をカバーするには完全に力不足である 39。

### **複合フォント（Composite Fonts）とCJKサポート**

多言語対応や大規模文字セットを実現するために導入されたのが「複合フォント（Type 0 フォント）」である。複合フォントは、それ自身はグリフの実体を持たず、背後にある「CIDFont」と呼ばれるフォントライクなオブジェクトからグリフを取得するためのルート辞書として機能する 40。

複合フォントを正しくレンダリングするため、PDFライブラリは以下の複雑なマルチステージ・ルックアップ・パイプラインを正確に実装しなければならない。

1. **文字コードからCIDへのマッピング**: ライブラリはテキストストリームからマルチバイトの文字コード列を読み取る。このバイト列は、Type 0 フォントの /Encoding 辞書で指定された「CMap（Character Map）」を通してフィルタリングされる 39。CMapは、入力された任意のバイト列（Shift\_JIS、EUC、UTF-8など）を、フォント内の抽象的な文字識別子である「CID（Character Identifier）」という整数値へと一方向に変換する辞書プログラムである 39。  
2. **CIDFontのメトリクス取得**: 取得されたCIDを用いて、子要素であるCIDFont（Type 1のアウトラインを持つ CIDFontType0、またはTrueTypeのアウトラインを持つ CIDFontType2）にアクセスし、該当する文字の幅や高さ、縦書き用のメトリクス情報を取得する 40。仕様上、すべてのCIDFontは必ず CID 0 のグリフを定義しなければならず、これは文字が見つからなかった場合のフォールバック（.notdef、通常は四角形の豆腐文字）として扱われる 42。  
3. **CIDからGIDへのマッピング**: ここで終わらないのがPDFの複雑な点である。CIDはあくまで抽象的な文字のIDであり、埋め込まれた実際のTrueTypeフォントファイル（フォントプログラム）内における物理的な「グリフインデックス（GID）」とは必ずしも一致しない。特に CIDFontType2（TrueType）の場合、ライブラリはCIDFont辞書内の /CIDToGIDMap ストリームを解析し、CIDから最終的な物理的GIDへの変換を行わなければならない 39。もしこのマップが Identity という名前の特別なマッピングを指定している場合のみ、CIDとGIDの数値は同一であるとみなされるが、ライブラリは常にこの辞書をパースして確認するロジックを担保しなければならない 39。

### **テキスト抽出とToUnicodeマッピング**

データスクレイピングシステム、RAG（Retrieval-Augmented Generation）のための文書解析、検索エンジンのインデクシングなどを行うPDFパーサーにとって、ドキュメントから「意味のあるテキスト」を抽出することはレンダリング以上に困難な課題となる 37。なぜなら、画面上では正しく日本語の文章として表示されていても、ストリーム内のバイトコードは独自のCIDにマッピングされており、標準的なテキストデータとしてコピー＆ペーストできないからである 37。

この問題を解決するため、セマンティックなテキスト抽出を目指すパーサーは、フォント辞書に紐付けられた /ToUnicode CMapを探索しなければならない 39。この特殊なCMapは、CID変換の描画パイプラインをバイパスし、ストリーム内の生の文字コード（バイト列）を標準的なUTF-16のUnicodeコードポイントへと直接マッピングする変換表を提供する 39。もしドキュメントに /ToUnicode が含まれておらず、さらに高度にサブセット化されたカスタムフォントが使用されている場合、その文字の意味的な情報は完全に失われており、OCR（光学文字認識）のヒューリスティックに頼る以外にテキストを復元する方法は存在しない 37。また、PDFには「単語間のスペース」という概念が存在しないことが多く、文字間の空白は Td オペレータなどによる座標の水平移動（カーニング調整）として表現されるため、パーサーは各グリフのバウンディングボックス（境界矩形）の幾何学的な交差判定を行い、論理的な単語や段落の境界を自力で推測・再構築する高度なアルゴリズムが要求される 38。

## **8\. データ圧縮とストリームフィルタ**

冗長なPostScript由来のプレーンテキストオペレータや、高解像度のラスタ画像をそのままファイルに格納すると、PDFファイルのサイズは非現実的なほど肥大化する。そのため、PDF内の事実上すべてのストリームオブジェクトは数学的な圧縮アルゴリズムを利用している。この圧縮・展開のメカニズムは、ストリーム辞書の /Filter キーによって管理され、パーサーに対してストリームのバイナリペイロードをどのようにデコード（解凍）すべきかを正確に指示する 11。

包括的なPDFライブラリを実装するためには、以下の標準的なデコーダスイートをすべてサポートする必要がある 12。

| フィルタ名 | 圧縮アルゴリズム / 用途 | ライブラリ実装における留意点 |
| :---- | :---- | :---- |
| /FlateDecode | zlib/DEFLATE圧縮アルゴリズム | 最も普遍的で重要なフィルタ。テキストストリームやオブジェクトストリームの圧縮に多用される。ライブラリは外部のzlibライブラリ等と連携して高速な展開処理を実装する必要がある 12。 |
| /LZWDecode | Lempel-Ziv-Welch辞書ベース圧縮 | 古いPDFファイルで使用される可逆圧縮。GIF画像などで使われるアルゴリズムと同等 12。 |
| /ASCII85Decode /ASCIIHexDecode | ASCIIエンコーディング | バイナリデータ（8ビット）を印字可能なASCII文字（7ビット）に変換するためのエンコーディング。古いテキストベースのメールプロトコル等でファイルが破損するのを防ぐ目的で使われた。ASCII85は4バイトのバイナリを5文字のASCIIにエンコードする 12。 |
| /DCTDecode | JPEG画像圧縮 | ストリーム内にJPEG画像データがそのまま格納されていることを示す。パーサーはデータをJPEGデコーダにそのまま引き渡す 12。 |
| /CCITTFaxDecode /JBIG2Decode | モノクロ画像圧縮（ファックス規格） | 主にスキャンされたアーカイブ文書などで、1ビットのモノクロ画像を極端に高く圧縮するために使用される高度に専門化されたアルゴリズム 12。 |

PDFアーキテクチャの柔軟な点として、これらのフィルタは配列を用いて「カスケード（多段）接続」することが可能である（例：\`\`） 12。この配列に遭遇した場合、ライブラリはパイプライン処理を構築し、指定された配列の順序通りにペイロードを通してデコードしなければならない。上記の例であれば、まずASCII85エンコーディングを解除してバイナリ列を取り出し、次にそのバイナリ列をDEFLATEアルゴリズムで解凍するという順序で処理を実行する 12。

### **オブジェクトストリーム（Object Streams）による構造圧縮**

PDF 1.4までの仕様では、ストリームのコンテンツ自体は圧縮できても、辞書や配列、xrefテーブルのような構造データそのものはプレーンテキストとしてファイル内に残るため、構造が複雑になるほどファイルサイズが膨張するという弱点があった。この課題を克服するため、PDF 1.5からは /Type /ObjStm という「オブジェクトストリーム」の概念が導入された 7。これは、数十から数百のインダイレクトオブジェクト（ただしストリームオブジェクト自体は除く）を直列化し、1つの巨大なストリーム内にまとめてFlate圧縮して格納する仕組みである 11。

XRefストリームは、特定の間接オブジェクトのオフセットを指す際、バイトオフセットではなく「どのオブジェクトストリーム内の、何番目のインデックスに格納されているか」を指し示す形式に拡張されている 11。ライブラリが対象オブジェクトを取得する際、親であるオブジェクトストリーム全体を解凍し、内部の専用オフセットテーブルをパースして該当オブジェクトを取り出すという追加のロジックが必要となる 11。現代のPDFを処理するためには、このオブジェクトストリームの実装は不可避の要件である。

## **9\. ファイルの変更メカニズム：インクリメンタルアップデートとリニアライズ**

PDF仕様は、巨大なファイルを編集・保存する際のパフォーマンスを最適化するため、データ構造全体を上書きするのではなく、ファイルに追記を行う特異なファイル変更パラダイムを提供している。ライブラリ開発者は、データの追記とWeb配信最適化という相反する2つの構造を正確にハンドリングしなければならない 53。

### **インクリメンタルアップデート（Incremental Updates）の追記機構**

PDFフォームへの入力、注釈（アノテーション）の追加、デジタル署名の適用などを行う際、適合ライターは元のファイルのバイト列には一切手を加えない 53。代わりに、新しく変更または追加されたオブジェクトを既存のファイルの末尾（元の %%EOF の後）にそのまま追記（アペンド）する。そして、その追記されたオブジェクトだけを指し示す新しい相互参照テーブル（xref）と、新しいトレイラ辞書を作成し、最後に新しい %%EOF を付与する 7。

新しいトレイラ辞書には /Prev というキーが含まれており、これには直前の（古い）相互参照テーブルのバイトオフセットが記載されている 54。ライブラリがインクリメンタルアップデートされたファイルを解析する手順は以下の通りである。

1. ファイルの最後尾の %%EOF から新しいxrefテーブルを読み込む。  
2. そのxrefテーブルに記載されている最新のオブジェクトをインデックス化する。  
3. トレイラ辞書の /Prev キーを辿り、古いxrefテーブルへと逆方向に再帰的にジャンプする 54。  
4. 古いテーブルのオブジェクトをインデックス化する際、すでに新しいテーブルで同名のオブジェクト（同じオブジェクト番号）が定義されていれば、古い方を破棄し、新しい定義でシャドウイング（上書き）する 54。 もしアップデート中にオブジェクトが明示的に削除された場合、新しいxrefテーブル内でそのエントリには f (free) フラグが立てられ、世代番号がインクリメントされることで、過去のバージョンに存在したオブジェクトが無効化されたことをパーサーに通知する 58。この仕組みにより、PDFはファイル内にネイティブなバージョン管理システムを内包しており、最後のアップデート部分を切り捨てるだけで数学的に完全に元の状態へロールバックすることが可能となっている 54。

### **リニアライズ（Linearization / Fast Web View）**

インクリメンタルアップデートがファイルの末尾にデータを追加していく構造であるのに対し、リニアライズ化（別名：Fast Web View）は、ネットワークの遅延が大きい環境（インターネット上）において、ファイル全体のダウンロードが完了する前に最初のページを即座にストリーミング表示できるようにするため、ファイルの内部構造を完全に再構築（再配置）する技術である 53。

標準的なPDFでは、トレイラ辞書とドキュメントカタログ（ファイルの目次）がファイルの末尾にあるため、Webブラウザはファイルを最後までダウンロードしなければ1ページ目すら描画できない 60。リニアライズされたPDFは、ファイルヘッダの直後に「リニアライズ化パラメータ辞書（Linearization Parameter Dictionary）」を配置し、さらに1ページ目の描画に必要となるドキュメントカタログ、最初のページのページ辞書、フォント、画像などのすべてのリソースをファイルの先頭付近に強制的に集約する 2。そして、この先頭のオブジェクト群のみをインデックス化する専用のxrefテーブルを直後に配置し、残りのページの情報はファイルの後方に配置するという、複雑な2段階のxref構造を形成する 57。

ライブラリ開発で注意すべきは、リニアライズ化とインクリメンタルアップデートは構造的に相反し、互いに排他的であるという点である 53。リニアライズされたPDFに対して一度でもインクリメンタルな追記保存を行ってしまうと、新しいオブジェクトがファイルの末尾に追加されるため、せっかく先頭に集約したデータ構造の完全性が崩壊し、リニアライズの恩恵は失われる 53。適合パーサーは、ファイルの先頭で /Linearized フラグを検出した場合でも、ファイル末尾に追記された形跡がないかを厳格に分析し、最適化されたストリーミング読み込みを継続するか、通常の末尾からの解析に切り替えるかの分岐を判断しなければならない 25。

## **10\. PDFライブラリのアーキテクチャ設計と実装のベストプラクティス**

適合リーダー、適合ライター、あるいは高度なテキスト解析パーサーのいずれを開発する場合でも、PDFという仕様をソフトウェアのコードに落とし込む作業は、システム設計に対する極限のテストとなる 6。開発者は、抽象的なグラフィックスステートの操作、レガシーな暗号化アルゴリズム、バイナリツリーの動的解決、そして複雑怪奇なタイポグラフィの仕様をすべて一つのライブラリ内でシームレスに統合しなければならない 49。

### **構造的なカオスへの対処（Postelの法則の適用）**

PDFの生成エコシステムは歴史的に、仕様に対する厳格なコンプライアンスの欠如という問題を抱えてきた。世界中に流通している数兆のPDFファイルの中には、多数のバグを含むサードパーティ製ライブラリによって生成されたものが溢れている。そのため、堅牢なPDFライブラリは、「送信するものについては厳密に、受信するものについては寛容に（Postelの法則）」という原則に基づいて構築されなければならない。

実際のファイルでは、xrefテーブルのバイトオフセットが数バイトずれている、EOFマーカーが欠落している、文字列リテラルのエスケープが不完全である、ページツリーの /Parent や /Kids 参照がループして循環参照（Circular reference）を引き起こしている等、無数の構造的なカオスが存在する 29。ライブラリが /Pages ツリーを再帰的にトラバースする際、循環参照による無限ループ（スタックオーバーフロー）でプロセスがクラッシュするのを防ぐため、訪問したオブジェクトIDをヒストリとして明示的に追跡・記録するサイクル検出ヒューリスティックを必ず実装しなければならない。さらに、xrefテーブルのパースに失敗した場合に備え、ファイル全体のバイト列を頭からスキャンして正規表現等で obj と endobj の境界をブルートフォース（総当たり）で検出し、自力で相互参照テーブルを再構築するようなフェイルセーフなフォールバックスキャナの実装が強く推奨される 29。

### **開発言語の選定とメモリ安全性**

PDFエンジンの安定性とセキュリティは、採用するプログラミング言語のパラダイムに深く依存する。歴史的に、ChromiumのバックエンドであるPDFiumや、Ghostscript、qpdf、libHaruといったPDF生成・解析の基盤ライブラリは、画像の解凍や複雑な数学的行列変換を最高速度で処理するためにC言語やC++で実装されてきた 7。

しかし、サードパーティから提供される信頼できないバイナリフォーマット（PDF）をネイティブコードで解析することは、極めて深刻なセキュリティリスクを伴う。悪意を持って細工されたxrefテーブルや、不正なフォントストリームを読み込んだ際に発生するバッファオーバーフロー、Use-After-Free（解放後メモリの使用）、境界外配列アクセスといったメモリ破損の脆弱性は、PDFライブラリにおける最も一般的な攻撃ベクタである 66。

その結果、現代のシステムアーキテクチャのトレンドは、厳格なメモリ安全性をコンパイラレベルで保証するシステムプログラミング言語、特にRustへと急速に移行しつつある 66。Rustで記述されたピュアなPDF解析ライブラリ（例えば lopdf など）は、ポインタに関連するセキュリティ上の欠陥をコンパイル時に排除しつつ、高度な最適化によってC++と同等の実行速度を維持することが可能である 66。PDFのように、非圧縮の巨大なオブジェクトDOMを展開し、数百万に及ぶ細かなメモリアロケーションのライフサイクルを管理しなければならないシステムにおいて、Rustの所有権モデルは極めて強力なアーキテクチャ上の利点をもたらす 66。

### **実装すべき最小限のアーキテクチャパイプライン**

ゼロからPDFパーサーを設計する場合、以下の明確に分離されたパイプラインモジュールを中心にアーキテクチャを構築すべきである。

1. **レクサー / トークナイザ (Lexer / Tokenizer)**: バイトストリームを読み込み、仕様に基づきホワイトスペースをスキップし、厳密に型付けされた9種類のプリミティブトークンを生成する高度に最適化されたステートマシン 70。  
2. **グラフリゾルバとオブジェクトキャッシュ (Graph Resolver)**: xrefテーブル（およびXRefストリーム）を解析し、インダイレクト参照 N G R を実際のオブジェクトに解決するレイヤ。ギガバイト級のPDFを開いた際にシステムのRAMを枯渇させないよう、要求されるまでオブジェクトの実体をメモリにロードしない「遅延読み込み（Lazy Loading）」のキャッシュメカニズムを実装する 7。  
3. **DOMトラバーサ (DOM Traverser)**: /Catalog から始まり、/Pages ツリーを巡回するモジュール。前述した属性の継承ノードを評価し、ページごとに完全な /Resources 辞書や /MediaBox を動的に構築（マッピング）する役割を担う 10。  
4. **ストリームインタプリタ (Stream Interpreter)**: zlibやASCIIフィルタを用いてバイナリペイロードを展開し、スタックベースのPostScriptオペランドとオペレータを一つずつ評価しながら、グラフィックスステートマシンを更新・実行していくレンダリングの心臓部 8。

Portable Document Formatは、ハードウェアやソフトウェアの世代を超えて絶対的な視覚的忠実性を維持し続けるよう設計された、デジタルにおける強靭性の結晶である。そのアーキテクチャは、間接オブジェクト参照によるグラフ構造、階層的なプロパティ継承、PostScriptに由来するスタックベースのステートマシン、そして高度に多層化された暗号化と圧縮システムによって定義されている。ソフトウェアライブラリにおいて、単なるバイナリのバイトストリームからドキュメントのセマンティックな解釈へと橋渡しを行うためには、極めて厳格なエンジニアリングの規律が求められる。相互参照テーブルのメカニズムを制御し、複雑なCIDFontの多段階マッピングパイプラインを実装し、コンテキストに依存するコンテンツストリームオペレータを正確に実行することこそが、堅牢で高性能、かつISO標準に準拠したPDFライブラリを開発するための絶対的な前提条件となる。

#### **引用文献**

1. Portable document format — Part 1: PDF 1.7 \- Adobe Open Source, 3月 13, 2026にアクセス、 [https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000\_2008.pdf](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)  
2. PDF Reference, Third Edition \- Adobe Open Source, 3月 13, 2026にアクセス、 [https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.4.pdf](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.4.pdf)  
3. ISO 32000-1 \- PDF Association, 3月 13, 2026にアクセス、 [https://pdfa.org/resource/iso-32000-1/](https://pdfa.org/resource/iso-32000-1/)  
4. ISO 32000-2 \- PDF Association, 3月 13, 2026にアクセス、 [https://pdfa.org/resource/iso-32000-2/](https://pdfa.org/resource/iso-32000-2/)  
5. ISO 32000-2 FDIS \- Adobe Developer, 3月 13, 2026にアクセス、 [https://developer.adobe.com/document-services/docs/assets/5b15559b96303194340b99820d3a70fa/PDF\_ISO\_32000-2.pdf](https://developer.adobe.com/document-services/docs/assets/5b15559b96303194340b99820d3a70fa/PDF_ISO_32000-2.pdf)  
6. Creating a PDF : r/webdev \- Reddit, 3月 13, 2026にアクセス、 [https://www.reddit.com/r/webdev/comments/1rel8bt/creating\_a\_pdf/](https://www.reddit.com/r/webdev/comments/1rel8bt/creating_a_pdf/)  
7. The Structure of a PDF File. Introduction | by Jay Berkenbilt \- Medium, 3月 13, 2026にアクセス、 [https://medium.com/@jberkenbilt/the-structure-of-a-pdf-file-6f08114a58f6](https://medium.com/@jberkenbilt/the-structure-of-a-pdf-file-6f08114a58f6)  
8. Working with content streams — pikepdf 10.5.0 documentation, 3月 13, 2026にアクセス、 [https://pikepdf.readthedocs.io/en/latest/topics/content\_streams.html](https://pikepdf.readthedocs.io/en/latest/topics/content_streams.html)  
9. Intro To PDF Object \- BabelDOC \- GitHub Pages, 3月 13, 2026にアクセス、 [https://funstory-ai.github.io/BabelDOC/intro-to-pdf-object/](https://funstory-ai.github.io/BabelDOC/intro-to-pdf-object/)  
10. PDF syntax 101: Understanding PDF Object Types \- Nutrient, 3月 13, 2026にアクセス、 [https://www.nutrient.io/blog/pdf-syntax-101/](https://www.nutrient.io/blog/pdf-syntax-101/)  
11. Introduction to PDF syntax | Blog | Guillaume Endignoux, 3月 13, 2026にアクセス、 [https://gendignoux.com/blog/2016/10/04/pdf-basics.html](https://gendignoux.com/blog/2016/10/04/pdf-basics.html)  
12. PDF Stream Objects | Didier Stevens, 3月 13, 2026にアクセス、 [https://blog.didierstevens.com/2008/05/19/pdf-stream-objects/](https://blog.didierstevens.com/2008/05/19/pdf-stream-objects/)  
13. Working with Cos Objects \- Adobe Open Source, 3月 13, 2026にアクセス、 [https://opensource.adobe.com/dc-acrobat-sdk-docs/library/plugin/Plugins\_Cos.html](https://opensource.adobe.com/dc-acrobat-sdk-docs/library/plugin/Plugins_Cos.html)  
14. PDF File Structure: A Comprehensive Guide \- Mapsoft, 3月 13, 2026にアクセス、 [https://mapsoft.com/summary-of-structure-of-pdf-files/](https://mapsoft.com/summary-of-structure-of-pdf-files/)  
15. The PDF Format — PyPDF2 documentation \- Read the Docs, 3月 13, 2026にアクセス、 [https://pypdf2.readthedocs.io/en/3.x/dev/pdf-format.html](https://pypdf2.readthedocs.io/en/3.x/dev/pdf-format.html)  
16. 3月 13, 2026にアクセス、 [https://pypdf2.readthedocs.io/en/3.x/dev/pdf-format.html\#:\~:text=Overall%20Structure%EF%83%81\&text=Header%3A%20Contains%20the%20version%20of,Trailer](https://pypdf2.readthedocs.io/en/3.x/dev/pdf-format.html#:~:text=Overall%20Structure%EF%83%81&text=Header%3A%20Contains%20the%20version%20of,Trailer)  
17. PDF 2.0, ISO 32000-2 (2017, 2020\) \- The Library of Congress, 3月 13, 2026にアクセス、 [https://www.loc.gov/preservation/digital/formats/fdd/fdd000474.shtml](https://www.loc.gov/preservation/digital/formats/fdd/fdd000474.shtml)  
18. Guide to Navigating PDF Internals | Lukes Lab, 3月 13, 2026にアクセス、 [https://www.lukeslab.io/post/pdf-internals/](https://www.lukeslab.io/post/pdf-internals/)  
19. What is the smallest possible valid PDF? \[closed\] \- Stack Overflow, 3月 13, 2026にアクセス、 [https://stackoverflow.com/questions/17279712/what-is-the-smallest-possible-valid-pdf](https://stackoverflow.com/questions/17279712/what-is-the-smallest-possible-valid-pdf)  
20. A Quick Introduction to PDF Syntax, 3月 13, 2026にアクセス、 [https://pdfsyntax.dev/introduction\_pdf\_syntax.html](https://pdfsyntax.dev/introduction_pdf_syntax.html)  
21. The smallest possible (valid) PDF, 3月 13, 2026にアクセス、 [https://pdfa.org/the-smallest-possible-valid-pdf/](https://pdfa.org/the-smallest-possible-valid-pdf/)  
22. Syntax and validation of PDF graphics | Blog \- Guillaume Endignoux, 3月 13, 2026にアクセス、 [https://gendignoux.com/blog/2017/01/05/pdf-graphics.html](https://gendignoux.com/blog/2017/01/05/pdf-graphics.html)  
23. 3.6.2 Page Tree \- PDF Format Reference \- Adobe Portable Document Format, 3月 13, 2026にアクセス、 [https://www.verypdf.com/document/pdf-format-reference/pg\_0143.htm](https://www.verypdf.com/document/pdf-format-reference/pg_0143.htm)  
24. Resource Dictionary and Inherited Page Attributes, 3月 13, 2026にアクセス、 [https://groups.google.com/g/pdfnet-sdk/c/x4TJyfvyIYk](https://groups.google.com/g/pdfnet-sdk/c/x4TJyfvyIYk)  
25. Clearly note that Linearized PDFs have specific inheritance rules \#291 \- GitHub, 3月 13, 2026にアクセス、 [https://github.com/pdf-association/pdf-issues/issues/291](https://github.com/pdf-association/pdf-issues/issues/291)  
26. Canvas \- SetaPDF-Core Manual, 3月 13, 2026にアクセス、 [https://manuals.setasign.com/setapdf-core-manual/canvas/](https://manuals.setasign.com/setapdf-core-manual/canvas/)  
27. as named resources 154 \- PDF Format Reference \- Adobe Portable Document Format, 3月 13, 2026にアクセス、 [https://www.verypdf.com/document/pdf-format-reference/pg\_0154.htm](https://www.verypdf.com/document/pdf-format-reference/pg_0154.htm)  
28. Vector Graphics Text \- PDF Association, 3月 13, 2026にアクセス、 [https://pdfa.org/wp-content/uploads/2023/08/PDF-Operators-CheatSheet.pdf](https://pdfa.org/wp-content/uploads/2023/08/PDF-Operators-CheatSheet.pdf)  
29. How to fix "cannot find ExtGState dictionary" in mupdf? \- Stack Overflow, 3月 13, 2026にアクセス、 [https://stackoverflow.com/questions/33741465/how-to-fix-cannot-find-extgstate-dictionary-in-mupdf](https://stackoverflow.com/questions/33741465/how-to-fix-cannot-find-extgstate-dictionary-in-mupdf)  
30. Added alpha blending to SynPDF. How to cleanly modify the pdf, 3月 13, 2026にアクセス、 [https://synopse.info/forum/viewtopic.php?pid=44033](https://synopse.info/forum/viewtopic.php?pid=44033)  
31. Graphics Operators | PDF Succinctly | Syncfusion®, 3月 13, 2026にアクセス、 [https://www.syncfusion.com/succinctly-free-ebooks/pdf/graphics-operators](https://www.syncfusion.com/succinctly-free-ebooks/pdf/graphics-operators)  
32. Content Streams And Resources | GemBox.Pdf, 3月 13, 2026にアクセス、 [https://www.gemboxsoftware.com/pdf/docs/content-streams-and-resources.html](https://www.gemboxsoftware.com/pdf/docs/content-streams-and-resources.html)  
33. PDF Association Cheat Sheet – Operators & Operands, 3月 13, 2026にアクセス、 [https://pdfa.org/download-area/cheat-sheets/OperatorsAndOperands.pdf](https://pdfa.org/download-area/cheat-sheets/OperatorsAndOperands.pdf)  
34. PDF Format Reference \- Adobe Portable Document Format \- VeryPDF, 3月 13, 2026にアクセス、 [https://www.verypdf.com/document/pdf-format-reference/pg\_0985.htm](https://www.verypdf.com/document/pdf-format-reference/pg_0985.htm)  
35. Uses of Class org.apache.pdfbox.contentstream.operator.Operator, 3月 13, 2026にアクセス、 [https://pdfbox.apache.org/docs/2.0.2/javadocs/org/apache/pdfbox/contentstream/operator/class-use/Operator.html](https://pdfbox.apache.org/docs/2.0.2/javadocs/org/apache/pdfbox/contentstream/operator/class-use/Operator.html)  
36. PDF File Format: A Two-Part Guide to Its Structure and Creation | Apryse SDK, 3月 13, 2026にアクセス、 [https://apryse.com/blog/pdf-structure-creation](https://apryse.com/blog/pdf-structure-creation)  
37. How to Parse a PDF, Part 1 \- Unstructured, 3月 13, 2026にアクセス、 [https://unstructured.io/blog/how-to-parse-a-pdf-part-1](https://unstructured.io/blog/how-to-parse-a-pdf-part-1)  
38. PDF Parsing Guide: Extract Sections & Tables \- LlamaIndex, 3月 13, 2026にアクセス、 [https://www.llamaindex.ai/blog/mastering-pdfs-extracting-sections-headings-paragraphs-and-tables-with-cutting-edge-parser-faea18870125](https://www.llamaindex.ai/blog/mastering-pdfs-extracting-sections-headings-paragraphs-and-tables-with-cutting-edge-parser-faea18870125)  
39. Understanding PDF CIDFonts, CMaps, and GIDs: Best Practices \- Stack Overflow, 3月 13, 2026にアクセス、 [https://stackoverflow.com/questions/75576696/understanding-pdf-cidfonts-cmaps-and-gids-best-practices](https://stackoverflow.com/questions/75576696/understanding-pdf-cidfonts-cmaps-and-gids-best-practices)  
40. Document Processing Libraries RadPdfProcessing Concepts Fonts \- Telerik.com, 3月 13, 2026にアクセス、 [https://www.telerik.com/document-processing-libraries/documentation/libraries/radpdfprocessing/concepts/fonts](https://www.telerik.com/document-processing-libraries/documentation/libraries/radpdfprocessing/concepts/fonts)  
41. Class Font \- Apryse Documentation, 3月 13, 2026にアクセス、 [https://sdk.apryse.com/api/PDFTronSDK/dotnetcore/pdftron.PDF.Font.html](https://sdk.apryse.com/api/PDFTronSDK/dotnetcore/pdftron.PDF.Font.html)  
42. PdfPig/font-notes.md at master \- GitHub, 3月 13, 2026にアクセス、 [https://github.com/UglyToad/PdfPig/blob/master/font-notes.md](https://github.com/UglyToad/PdfPig/blob/master/font-notes.md)  
43. PostScript fonts \- Wikipedia, 3月 13, 2026にアクセス、 [https://en.wikipedia.org/wiki/PostScript\_fonts](https://en.wikipedia.org/wiki/PostScript_fonts)  
44. PDGraphic \- PDF Library API Reference \- Adobe Open Source, 3月 13, 2026にアクセス、 [https://opensource.adobe.com/dc-acrobat-sdk-docs/pdflsdk/apireference/PD\_Layer/PDGraphic.html](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdflsdk/apireference/PD_Layer/PDGraphic.html)  
45. PDFont \- PDF Library API Reference \- Adobe Open Source, 3月 13, 2026にアクセス、 [https://opensource.adobe.com/dc-acrobat-sdk-docs/pdflsdk/apireference/PD\_Layer/PDFont.html](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdflsdk/apireference/PD_Layer/PDFont.html)  
46. Adobe Tech Note \#5099 (Developing CMap Resources for CID-Keyed Fonts) \- GitHub Pages, 3月 13, 2026にアクセス、 [https://adobe-type-tools.github.io/font-tech-notes/pdfs/5099.CMapResources.pdf](https://adobe-type-tools.github.io/font-tech-notes/pdfs/5099.CMapResources.pdf)  
47. CId-keyed fonts \- CJK Type Blog \- Adobe, 3月 13, 2026にアクセス、 [https://ccjktype.fonts.adobe.com/wp-content/uploads/2018/12/cjkv2e-pp387-393.pdf](https://ccjktype.fonts.adobe.com/wp-content/uploads/2018/12/cjkv2e-pp387-393.pdf)  
48. Adobe CMap and CIDFont Files Specification \- GitHub Pages, 3月 13, 2026にアクセス、 [https://adobe-type-tools.github.io/font-tech-notes/pdfs/5014.CIDFont\_Spec.pdf](https://adobe-type-tools.github.io/font-tech-notes/pdfs/5014.CIDFont_Spec.pdf)  
49. Smart Document Parsing: Transforming PDFs into AI-Ready Knowledge | by Taner Tombaş, 3月 13, 2026にアクセス、 [https://medium.com/@tombastaner/smart-document-parsing-transforming-pdfs-into-ai-ready-knowledge-1f8b8749f8af](https://medium.com/@tombastaner/smart-document-parsing-transforming-pdfs-into-ai-ready-knowledge-1f8b8749f8af)  
50. 7.4.3. ASCII85Decode Filter The ASCII85Decode filter decodes data that has been encoded in ASCII base-85 encoding and produces, 3月 13, 2026にアクセス、 [https://cdn3.f-cdn.com/files/download/192470245/File%2002-Re-Type.pdf](https://cdn3.f-cdn.com/files/download/192470245/File%2002-Re-Type.pdf)  
51. Data extraction from /Filter /FlateDecode PDF stream in PHP \- Stack Overflow, 3月 13, 2026にアクセス、 [https://stackoverflow.com/questions/11731425/data-extraction-from-filter-flatedecode-pdf-stream-in-php](https://stackoverflow.com/questions/11731425/data-extraction-from-filter-flatedecode-pdf-stream-in-php)  
52. peepdf/PDFFilters.py at master \- GitHub, 3月 13, 2026にアクセス、 [https://github.com/jesparza/peepdf/blob/master/PDFFilters.py](https://github.com/jesparza/peepdf/blob/master/PDFFilters.py)  
53. What is PDF Linearization? \- Apryse, 3月 13, 2026にアクセス、 [https://apryse.com/blog/pdf-format/what-is-pdf-linearization](https://apryse.com/blog/pdf-format/what-is-pdf-linearization)  
54. What are PDF Xref tables?, 3月 13, 2026にアクセス、 [https://blog.idrsolutions.com/what-are-pdf-xref-tables/](https://blog.idrsolutions.com/what-are-pdf-xref-tables/)  
55. What Is a Linearized PDF and Why Are They Important? \- Accusoft, 3月 13, 2026にアクセス、 [https://accusoft.com/resources/blog/what-is-a-linearized-pdf-and-why-are-they-important/](https://accusoft.com/resources/blog/what-is-a-linearized-pdf-and-why-are-they-important/)  
56. Incremental Update | Document Solutions for PDF \- mescius, 3月 13, 2026にアクセス、 [https://developer.mescius.com/document-solutions/dot-net-pdf-api/docs/online/Features/IncrementalUpdate](https://developer.mescius.com/document-solutions/dot-net-pdf-api/docs/online/Features/IncrementalUpdate)  
57. How to Use Append Mode, 3月 13, 2026にアクセス、 [https://documentation.activepdf.com/toolkit/toolkit\_api/Content/4\_c\_miscel\_appendix/Append\_Mode.html](https://documentation.activepdf.com/toolkit/toolkit_api/Content/4_c_miscel_appendix/Append_Mode.html)  
58. PDF Indirect references and incremental updates \- Stack Overflow, 3月 13, 2026にアクセス、 [https://stackoverflow.com/questions/41947004/pdf-indirect-references-and-incremental-updates](https://stackoverflow.com/questions/41947004/pdf-indirect-references-and-incremental-updates)  
59. Incremental PDF update, with automatic change tracking, or manual tracking of changes. Fixes issue \#816 by adnsistemas · Pull Request \#1741 · Hopding/pdf-lib \- GitHub, 3月 13, 2026にアクセス、 [https://github.com/Hopding/pdf-lib/pull/1741](https://github.com/Hopding/pdf-lib/pull/1741)  
60. What Is a Linearized PDF and When Should You Use It? \- PDFTool.io, 3月 13, 2026にアクセス、 [https://pdftool.io/blog/what-is-linearized-pdf](https://pdftool.io/blog/what-is-linearized-pdf)  
61. What is a linearized PDF file? A complete guide for fast web viewing \- Nutrient, 3月 13, 2026にアクセス、 [https://www.nutrient.io/blog/linearized-pdf/](https://www.nutrient.io/blog/linearized-pdf/)  
62. Common challenges in PDF development and how to overcome them \- Nutrient, 3月 13, 2026にアクセス、 [https://www.nutrient.io/blog/pdf-development-challenges/](https://www.nutrient.io/blog/pdf-development-challenges/)  
63. LibHaru Installation and Usage \- Oodles Technologies, 3月 13, 2026にアクセス、 [https://www.oodlestechnologies.com/blogs/libharu-installation-and-usage/](https://www.oodlestechnologies.com/blogs/libharu-installation-and-usage/)  
64. libHaru, 3月 13, 2026にアクセス、 [https://libharu.org/](https://libharu.org/)  
65. Generate Stunning PDFs in C++ with LibHaru and MinGW (g++) Complete Step by Step Tutorial \- YouTube, 3月 13, 2026にアクセス、 [https://www.youtube.com/watch?v=iFkdDw9xj6A](https://www.youtube.com/watch?v=iFkdDw9xj6A)  
66. Rust vs C++ Comparison \- Apriorit, 3月 13, 2026にアクセス、 [https://www.apriorit.com/white-papers/520-rust-vs-c-comparison](https://www.apriorit.com/white-papers/520-rust-vs-c-comparison)  
67. I want to recommend this gem of PDF library in Rust \- Reddit, 3月 13, 2026にアクセス、 [https://www.reddit.com/r/rust/comments/1b0lhyg/i\_want\_to\_recommend\_this\_gem\_of\_pdf\_library\_in/](https://www.reddit.com/r/rust/comments/1b0lhyg/i_want_to_recommend_this_gem_of_pdf_library_in/)  
68. Library for Building PDFs \- help \- The Rust Programming Language Forum, 3月 13, 2026にアクセス、 [https://users.rust-lang.org/t/library-for-building-pdfs/110738](https://users.rust-lang.org/t/library-for-building-pdfs/110738)  
69. Comparing Parallel Rust and C++ \- Hacker News, 3月 13, 2026にアクセス、 [https://news.ycombinator.com/item?id=21469295](https://news.ycombinator.com/item?id=21469295)  
70. Content streams — pikepdf 10.5.0 documentation, 3月 13, 2026にアクセス、 [https://pikepdf.readthedocs.io/en/latest/api/filters.html](https://pikepdf.readthedocs.io/en/latest/api/filters.html)

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAYCAYAAABurXSEAAACsklEQVR4Xu2WWaiNURTHFzJPGTPLlTFPnkShKF1FiZIH5BahkJQ5eREPRBKSumbiBUniRUKGPCgUeeIqU+kiUxn+f2vvY33L9jnHrXNK91e/ztlr7bO/73x7f2tvkUYaKZlOsLUPlhFev40P5tEL3oQdfaKMDIdXYVufSNES3oDzfKICbINnYVOf8GyFt2ETn6gAHeALON8nLOz0Fo72iQpSA5/AFj4RWQbv+WCFaQa/wGk+EbkET/ugoQ+cAjuHNtf/eMl5CjmMgj19ELTzAfAI7vLByGPRNZ1iDbwYPp/D5fAM3AzvmH7FcAiuh19Fq0RkKvwsukwt5+FdF/tJnIaFPgGq4V7TvgZfi5bGW/ADbGXyeUyHK+BQ+B0uMrlj8KlpR3bCVz5I+osOMsEnwDrYzbRfwsPh+0w40eT+xibRTYszxesNNDnO4HHTjiwVnZXfSt9I0UH4mQenk/0aWse5F7C0RoaJjpua6dnwmyTenQGiP5rhE44lov2qfKIEeoiOsdbEFocYb96zAT7zQdJe9EerfQLMFf0h4Q5VZ3JcVnwZLfxDeWt8kui1xprYSdHlkYIvLrf0JLyZ/S7GKfkkOmh3+FH0XEK4xg7CfqFNOGOcyocm5olLcXJoD4H18EShR5brojee5AC87GKElWMfPALHiZZGts+JVgMLy9UD+F6yL5lnB7wP94jeFP/EgkyPX/DFX+mDEa5nlpbU1HIdxqMqnzCfaB674WAfDHApcgx+cva49DibvW2nQF/R2s3rJ+FAfEoscQ2Bh60LPhgYIVrXV4V2F9GlsaXQI8tR0RnOhdv0O0n/62JhDbabhmWW6MbEJ8eneAWekvSBfwx8Awf5RApusXHz+Bd4w3862jaH20WrUC2ck00X4KyzjnM3LpqNsKsPlhEeqHgs/X/4AUw/epj7E/NpAAAAAElFTkSuQmCC>