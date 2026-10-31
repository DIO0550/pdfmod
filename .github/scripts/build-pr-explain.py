#!/usr/bin/env python3
"""PR の解説(`explain.json`、version 1)を検査し、コード抜粋の中身を足して書き出す。

解説はセッションが `docs/development/pr-explain.md`で書き、ページの固定スクリプトが変更の地図(`change-map.json`)と
合わせて 5 画面に組む。ここが防ぐのはスクリプトの注入ではなく(それは `check-pr-explain-template.py` の
管轄)、**形の崩れと解説の中の参照切れ**(ページが黙って空欄を出す)。報告する違反は 4 つ。

- `pr-explain-shape` — 読めない・形が表と違う(必須の欠け・知らないキー・重複したキー・型・語彙・
  綴り・一意性・範囲・状況の表のマスの揃い・振る舞いの前後が同じ・用語の印の書き方・強調の範囲)
- `pr-explain-meta` — `pr` が公開先の PR と違う
- `pr-explain-ref` — 解説の中の参照が解説の中に無い(message の from / to・flow の steps など)・用語の印が terms に
  無い・どの印からも指されない用語
- `pr-explain-code` — 解説時点の `sha` がこのリポジトリに無い・抜粋のパスがその sha に無い・範囲が
  ファイルに収まらない・技術の各節に空白以外の本文を持つ抜粋が無い

**地図を指す参照(commitStory の sha・Note のパスと行・Target の layer / file・LayerRole の layer・
concept・primers の出てくる場所の `path`・`lineRange`・`shas` が地図にあるか)は見ない。** 地図は push のたびに
作り直されるので、解説を書いた時点で合っていても後で外れる。外れたものはページが「地図に無い」と出す。

抜粋(Excerpt を指すすべての道筋。`tests[].excerpt`・`primers[].passages[].excerpt`)の中身は手で写させず、
`git cat-file blob <sha>:<path>` の行範囲をここで `text` として足す。行は改行で割って数える(末尾に改行の
無い最終行も 1 行)。入力に `text` を書いた解説は落とす(手で写した中身が黙って上書きされるのを、書いた側に
知らせるため)。強調の範囲(`emphasis`)は書いたまま残す。

技術の各節(`language` / `codebase`)には、その sha から読んだ空白以外の `excerpt` が 1 件以上必要。
宣言・出てくる場所・他の節やテストの抜粋は代わりにならない。これは本文の存在の検査であり、説明の質は保証しない。
ページの読み取り用の形は変えず、過去の解説は読めるまま、新しく書き出すときの公開条件として検査する。

埋め込み(script / style 要素・ヒアドキュメント)を読む拡張子の抜粋には、始まりの行の頭で効いている埋め込みを開いた行を
`openingLine` として足す。ページが抜粋を途中の行から色分けするためで、拡張子と規則は `lib/embedded_regions.py`。`text` と
同じく出力だけのキーで、入力に書いた解説は Excerpt の形に無いキーとして落とす。

見出し(`Heading` を使うキー)は、小文字と大文字の継ぎ目(`[a-z][A-Z]`)がある複合語を、docs に出る語の
ほかは落とす。大文字だけの略語(UI 案・VRT)はこのリポジトリの語彙なので通す。1 語の識別子・ファイル名・snake_case は
綴りで識別子と言い切れないので見ない(見出しには書かない)。

- 語は ASCII 英数字の並びで切り出し、単語の境界は見ない。日本語が空白なしで続く識別子も落とすため
- `` `…` `` の中も除かない。名前は書いたまま描かれ、囲んでも識別子がそのまま画面に出るため
- highlights の `title` は `` `…` `` をコードとして描くが、題も概念で書くので他の見出しと扱いを揃える
- docs(`docs/**/*.md`)に出る語は通す。FlateDecode 等のフレームワーク名や仕様の用語は仕様の語で、言い換えるとかえって伝わらない
  ため。一覧を手で持たず docs を正本にする

振る舞い(`impact`)の文字列は、すべて使う人の言葉(`UserText`)で書く。見出しと同じ継ぎ目の規則に加えて
`` ` `` も落とす。振る舞いの画面はコードの名前を出さずに読ませる画面で、文はどれも書いたまま描く。
「コードの名前を出さない」が何を守るかは、ここを正本にする(`docs/development/pr-explain.md`はここを指す)。

- **検査で守るのは `impact` の文字列。** ページはそれに固定の文言と、`impact` の文字列から導いた文(マスの状況の
  「行 · 列(注)」・件数)を足すだけなので、そこにも名前は入らない
- 例外は根拠として添える名前で、テスト名(`tests[].name`。検査しない)とやりとりの名前(`messages[].name`。
  見出しの規則)はそのまま出る
- 1 語の識別子・ファイル名・snake_case は綴りで識別子と言い切れないので、この規則でも捕まらない。書き方の
  規則(`docs/development/pr-explain.md`)で受ける

技術の手引き(`primers`)の本文の用語の印 `[[表示|用語の id]]` は、`MarkedText` のキー(`gist`・text と注意メモの段の
`text`・引数の `text`)だけで読む。印の書き方は `docs/development/pr-explain.md`の「共通の規則」が持ち、ここには理由だけを置く。

- ページは印で先に割り、印の中と外でそれぞれ `` `…` `` をコードにするので、印をまたいで `` ` `` は対にならない。そのため
  `` ` `` は印の外の切れ端ごとに数える
- `` ` `` の中に書いた印の形は、コードのつもりでも印になる。`` ` `` の外の印でない `[[` / `]]` は、印の書き損じと見分けられない

使い方:
    build-pr-explain.py <explain.json> --pr <番号> --out <書き出す先> [--repo <リポジトリ>]

違反が無ければ書き出して終了コード 0。違反があれば標準出力へ報告して 1(書き出さない)。
引数の誤り・解説のファイルが無いときは 2。`--repo` の既定は今のフォルダ。
"""

import json
import re
import subprocess
import sys
from functools import reduce
from pathlib import Path
from typing import Callable, NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from embedded_regions import opening_lines

# 抜粋の行数の上限。
MaxExcerptLines = 80


class Scalar(NamedTuple):
    """1 つの値の規則。`rule` は `ScalarRules` のキー。"""

    rule: str


class Word(NamedTuple):
    """決まった語のどれか。"""

    words: tuple[str, ...]


class Many(NamedTuple):
    """配列。`least` は最小の件数、`distinct` は要素の重複を許さないか。"""

    item: object
    least: int = 0
    distinct: bool = False


class Shape(NamedTuple):
    """`Shapes` に名前で定義したオブジェクト。"""

    name: str


class Variant(NamedTuple):
    """`kind` で持つキーが決まるオブジェクト(`Variants` に名前で定義)。"""

    name: str


class Field(NamedTuple):
    """オブジェクトの 1 つのキー。"""

    value: object
    required: bool


class Duplicated(NamedTuple):
    """同じキーが 2 回以上書かれたオブジェクト。読み込みの時点でこの値に置き換え、形の検査で報告する。"""

    keys: tuple[str, ...]


def repeated(values: list) -> list:
    """2 回以上出た値を、並べ替えて 1 つずつ返す。"""
    return sorted({value for value in values if values.count(value) > 1})


def need(value: object) -> Field:
    """欠けたら違反になるキー。"""
    return Field(value, True)


def may(value: object) -> Field:
    """省いてよいキー。"""
    return Field(value, False)


def is_text(value: object) -> bool:
    """空でない文字列か。"""
    return isinstance(value, str) and value != ""


def is_count(value: object) -> bool:
    """1 以上の整数か(真偽値は整数として扱わない)。"""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


IdentifierJointPattern = re.compile(r"[a-z][A-Z]")
AsciiWordPattern = re.compile(r"[A-Za-z0-9]+")


def joint_words(text: str) -> set[str]:
    """ASCII 英数字の並びで切り出した語のうち、小文字と大文字の継ぎ目(`[a-z][A-Z]`)を含むものを集める。"""
    return {word for word in AsciiWordPattern.findall(text) if IdentifierJointPattern.search(word) is not None}


# docs が仕様の語として使う、継ぎ目を含む語(フレームワーク名・製品名)。
DocsJointWords = frozenset(
    word
    for doc in sorted((Path(__file__).resolve().parents[2] / "docs").rglob("*.md"))
    for word in joint_words(doc.read_text(encoding="utf-8"))
)


def is_text_with_only_docs_joints(value: object) -> bool:
    """空でない文字列で、継ぎ目を含む語がすべて docs に出る語か。"""
    return is_text(value) and joint_words(value) <= DocsJointWords


IdPattern = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
ShaPattern = re.compile(r"[0-9a-f]{40}")
# 用語の印 `[[表示|用語の id]]`。ページの `TermMarks.Pattern` と同じ綴りで、`pr-explain-core-cases.sh` が突き合わせる。
TermMarkPattern = re.compile(r"\[\[([^\[\]|]+)\|(" + IdPattern.pattern + r")\]\]")


def code_spans_of(text: str) -> list[tuple[bool, str]]:
    """文を `` ` `` で割り、コードか(奇数番目)と切れ端の組にする。閉じていない最後の `` ` `` はコードにせず文字のまま前の
    切れ端につなぐ。ページの `CodeSpans.create` と同じ割り方で、`pr-explain-core-cases.sh` が突き合わせる。
    """
    parts = text.split("`")
    has_unclosed = len(parts) % 2 == 0
    paired = [*parts[:-2], f"{parts[-2]}`{parts[-1]}"] if has_unclosed else parts
    return [(index % 2 == 1, part) for index, part in enumerate(paired)]


def plain_pieces_of(text: str) -> list[str]:
    """印で割った、印の外の切れ端。`n` 個目の切れ端は `n` 個目の印の前にある(ページの `TermMarks.piecesOf` と同じ割り方)。"""
    return TermMarkPattern.split(text)[0::3]


def has_stray_brackets(value: str) -> bool:
    """`` ` `` の外に、印になっていない `[[` / `]]` があるか。ページは印の外の切れ端ごとに `` ` `` を対にするので、切れ端ごとに見る。"""
    outside_code = [part for piece in plain_pieces_of(value) for is_code, part in code_spans_of(piece) if not is_code]
    return any("[[" in part or "]]" in part for part in outside_code)


def has_mark_in_code(value: str) -> bool:
    """`` ` `` の中に印の形を書いたか。印の始まりより前にある、印の外の `` ` `` が奇数なら、書き手はコードの中に書いている。"""
    plains = plain_pieces_of(value)
    ticks_before = [sum(piece.count("`") for piece in plains[:index + 1]) for index in range(len(plains) - 1)]
    return any(count % 2 == 1 for count in ticks_before)


def is_marked_text(value: object) -> bool:
    """空でない文字列で、用語の印の 2 つの規則(`has_stray_brackets` / `has_mark_in_code`)のどちらにも当たらないか。"""
    return is_text(value) and not has_stray_brackets(value) and not has_mark_in_code(value)


# 値の規則と、違反したときの説明。
ScalarRules: dict[str, tuple[Callable[[object], bool], str]] = {
    "text": (is_text, "空でない文字列"),
    "heading": (is_text_with_only_docs_joints, "見出し(小文字と大文字の継ぎ目がある複合語は、docs に出る語のほかは書かない)"),
    "user_text": (lambda value: is_text_with_only_docs_joints(value) and "`" not in value, "使う人の言葉(見出しの規則に加えて ` を書かない)"),
    "id": (lambda value: isinstance(value, str) and IdPattern.fullmatch(value) is not None, f"id({IdPattern.pattern})"),
    "sha": (lambda value: isinstance(value, str) and ShaPattern.fullmatch(value) is not None, "小文字 40 桁の sha"),
    "count": (is_count, "1 以上の整数"),
    "flag": (lambda value: isinstance(value, bool), "true か false"),
    "true": (lambda value: value is True, "true(偽なら書かない)"),
    "version": (lambda value: type(value) is int and value == 1, "1"),
    "marked_text": (
        is_marked_text,
        "空でない文字列(用語の印は [[表示|用語の id]]。` の中に印の形を書かない・` の外に印でない [[ / ]] を書かない・"
        "閉じていない ` の後ろはコードにならず、そこの [[ / ]] も ` の外として数える)",
    ),
}

Text = Scalar("text")
Heading = Scalar("heading")
UserText = Scalar("user_text")
Id = Scalar("id")
Sha = Scalar("sha")
Count = Scalar("count")
MarkedText = Scalar("marked_text")

# 技法・phase・やりとりの種類・方式・やりとりの状態・技術の節の状態・注意メモの種類の語彙。ページの表(固定スクリプトの
# 核の `Vocabulary`)と同じキーの集合で、`pr-explain-core-cases.sh` が突き合わせる。やりとりの状態と技術の節の状態は、
# 省けば前からあって変えていないもの。
Techniques = ("boundary", "equivalence", "error", "state", "regression", "idempotence", "type")
Phases = ("prep", "core", "hard", "revise", "fin")
MessageKinds = ("cmd", "qry", "evt")
Vias = ("call", "http", "state", "log", "exec", "file")
MessageStatuses = ("added", "changed", "removed")
PrimerStatuses = ("added", "changed")
RemarkKinds = ("caution", "memo", "rule", "spec", "history")

# 前後の組(振る舞いの変わったこと・増えた状況が同じ形で持つ)。これまでは 0 件でよく、これからは 1 件以上。
ImpactSides: dict[str, Field] = {
    "before": need(Many(Shape("ImpactLine"))),
    "after": need(Many(Shape("ImpactLine"), least=1)),
    "text": may(UserText),
}

# 解説の形(`docs/development/pr-explain.md`の「explain.json の形」の表を、検査が読む形にしたもの)。
Shapes: dict[str, dict[str, Field]] = {
    "Explain": {
        "version": need(Scalar("version")),
        "pr": need(Count),
        "sha": need(Sha),
        "issue": may(Count),
        "overview": need(Shape("Overview")),
        "features": may(Many(Shape("Feature"))),
        "layerRoles": may(Many(Shape("LayerRole"))),
        "concepts": may(Many(Shape("Concept"))),
        "messages": may(Many(Shape("Message"))),
        "flows": may(Many(Shape("Flow"))),
        "commitStories": may(Many(Shape("CommitStory"))),
        "suites": may(Many(Shape("Suite"))),
        "tests": may(Many(Shape("Test"))),
        "impact": may(Shape("Impact")),
        "primers": may(Many(Variant("Primer"))),
        "terms": may(Many(Shape("Term"))),
    },
    "Overview": {
        "title": need(Text),
        "lead": need(Text),
        "before": need(Many(Shape("Behavior"))),
        "after": need(Many(Shape("Behavior"), least=1)),
        "highlights": may(Many(Shape("Highlight"))),
    },
    "Behavior": {"text": need(Text), "message": may(Id)},
    "Impact": {
        "title": need(UserText),
        "lead": need(UserText),
        "changed": may(Shape("ImpactChange")),
        "tables": may(Many(Shape("SituationTable"))),
        "added": may(Many(Shape("AddedSituation"))),
        "kept": may(Many(Shape("KeptLine"))),
    },
    "ImpactChange": ImpactSides,
    "ImpactLine": {"text": need(UserText), "message": may(Id)},
    "SituationTable": {
        "label": need(UserText),
        "gist": may(UserText),
        "text": may(UserText),
        "rowHeads": need(Many(Shape("SituationRowHead"), least=1)),
        "columnHeads": need(Many(Shape("SituationColumnHead"), least=1)),
        "outcomes": need(Many(Shape("SituationOutcome"))),
    },
    "SituationRowHead": {"id": need(Id), "label": need(UserText), "note": may(UserText)},
    "SituationColumnHead": {"id": need(Id), "label": need(UserText)},
    "SituationOutcome": {
        "rowHead": need(Id),
        "columnHead": need(Id),
        "result": need(UserText),
        "was": may(UserText),
        "situation": may(UserText),
        "note": may(UserText),
        "tests": may(Many(Id, distinct=True)),
    },
    "AddedSituation": {"label": need(UserText), **ImpactSides, "tests": may(Many(Id, distinct=True))},
    "KeptLine": {"text": need(UserText), "tests": may(Many(Id, distinct=True))},
    "Highlight": {"title": need(Heading), "text": need(Text), "go": need(Variant("Target"))},
    "Feature": {"id": need(Id), "label": need(Heading), "role": need(Text)},
    "LayerRole": {"layer": need(Text), "role": need(Text)},
    "Concept": {
        "path": need(Text),
        "name": need(Heading),
        "role": need(Text),
        "feature": may(Id),
        "change": may(Text),
        "graph": may(Scalar("flag")),
    },
    "Message": {
        "id": need(Id),
        "from": need(Text),
        "to": need(Text),
        "kind": need(Word(MessageKinds)),
        "name": need(Heading),
        "code": need(Text),
        "via": need(Word(Vias)),
        "payload": may(Text),
        "returns": may(Text),
        "status": may(Word(MessageStatuses)),
    },
    "Flow": {"id": need(Id), "label": need(Heading), "steps": need(Many(Id, least=1))},
    "CommitStory": {
        "sha": need(Sha),
        "phase": need(Word(Phases)),
        "role": need(Text),
        "why": need(Text),
        "flows": may(Many(Id)),
        "review": may(Many(Text)),
        "before": may(Many(Shape("Behavior"))),
        "after": may(Many(Shape("Behavior"))),
        "notes": may(Many(Shape("Note"))),
    },
    "Note": {
        "path": need(Text),
        "side": may(Word(("new", "old"))),
        "start": need(Count),
        "end": need(Count),
        "text": need(Text),
    },
    "Suite": {"id": need(Id), "label": need(Heading), "file": need(Text)},
    "Test": {
        "id": need(Id),
        "suite": need(Id),
        "name": need(Text),
        "techniques": need(Many(Word(Techniques), least=1, distinct=True)),
        "why": need(Text),
        "given": need(Text),
        "when": need(Text),
        "then": need(Text),
        "todo": may(Scalar("true")),
        "commit": may(Sha),
        "excerpt": may(Shape("Excerpt")),
        "values": may(Shape("Values")),
        "targets": may(Many(Text)),
        "covers": may(Many(Id)),
    },
    # `text` と `openingLine` はここが足す出力だけのキーなので、入力の形には無い。
    "Excerpt": {"path": need(Text), "start": need(Count), "end": need(Count), "emphasis": may(Many(Shape("LineRange")))},
    "Values": {"columns": need(Many(Text, least=1)), "rows": need(Many(Shape("Row")))},
    "Row": {"cells": need(Many(Text)), "boundary": may(Scalar("flag"))},
    "Parameter": {"name": need(Text), "type": need(Text), "text": need(MarkedText), "note": may(Text)},
    # `lineRange` は解説の sha の時点の行番号。`shas` は地図と照合しない(地図を指す参照)。
    "Occurrence": {"path": need(Text), "lineRange": may(Shape("LineRange")), "text": need(Text), "shas": may(Many(Sha, distinct=True))},
    "LineRange": {"start": need(Count), "end": need(Count)},
    # 用語の名前(`label`)は、継ぎ目のある複合語(`WebView`)や識別子を書くので見出し(Heading)にしない。
    "Term": {"id": need(Id), "label": need(Text), "text": need(Text)},
}

# 技術の節(Primer)の、kind をまたいで同じキー。
PrimerFields: dict[str, Field] = {
    "id": need(Id),
    "category": need(Text),
    # 技術の名前は識別子や継ぎ目のある複合語を書くので、見出し(Heading)にしない。
    "label": need(Text),
    "gist": need(MarkedText),
    "passages": may(Many(Variant("Passage"))),
    "occurrences": need(Many(Shape("Occurrence"), least=1)),
    "seeAlso": may(Many(Id, distinct=True)),
}

# `kind` ごとに持つキー。他の kind のキーが混ざるのも、知らないキーとして落とす。Target はどの kind も、ページ
# (固定スクリプトの核の `Target`)がここと同じキーを読んで移る先にすることを `pr-explain-core-cases.sh` が確かめる。
# 同じキーは kind をまたいで同じ規則にする(`routes_under` が kind のキーを合わせて辿るため。`build-pr-explain-cases.sh` の
# 「どの Variant も、kind をまたいで同じキーは同じ規則を持つ」が確かめる)。
Variants: dict[str, dict[str, dict[str, Field]]] = {
    "Target": {
        "feature": {"id": need(Id)},
        "layer": {"layer": need(Text)},
        "file": {"path": need(Text)},
        "message": {"id": need(Id)},
        "flow": {"id": need(Id)},
    },
    "Primer": {
        "language": PrimerFields,
        "codebase": {
            **PrimerFields,
            "status": may(Word(PrimerStatuses)),
            "tests": may(Many(Id, distinct=True)),
            "flows": may(Many(Id, distinct=True)),
        },
    },
    "Passage": {
        "text": {"text": need(MarkedText)},
        "declaration": {"code": need(Text)},
        "parameters": {"parameters": need(Many(Shape("Parameter"), least=1))},
        "excerpt": {"excerpt": need(Shape("Excerpt"))},
        **{kind: {"text": need(MarkedText)} for kind in RemarkKinds},
    },
}


def span_problem(value: dict) -> str | None:
    """`start` 〜 `end` の範囲が逆向きでないかを見る(Note・Excerpt・LineRange)。"""
    if value["end"] < value["start"]:
        return f"end({value['end']})が start({value['start']})より前"
    return None


def excerpt_length_problem(value: dict) -> str | None:
    """抜粋が上限の行数に収まっているかを見る。"""
    length = value["end"] - value["start"] + 1
    if length > MaxExcerptLines:
        return f"抜粋は {MaxExcerptLines} 行まで(今は {length} 行)"
    return None


def emphasis_problem(value: dict) -> str | None:
    """抜粋の強調の範囲が、抜粋の行の中に収まっているかを見る。"""
    is_outside = lambda span: span["start"] < value["start"] or span["end"] > value["end"]
    outside = [index for index, span in enumerate(value.get("emphasis", [])) if is_outside(span)]
    if outside:
        return f"emphasis{outside} が抜粋の {value['start']}-{value['end']} 行目の外にある"
    return None


def cells_problem(value: dict) -> str | None:
    """値の表の各行が列と同じ数のセルを持つかを見る。"""
    width = len(value["columns"])
    uneven = [index for index, row in enumerate(value["rows"]) if len(row["cells"]) != width]
    if uneven:
        return f"rows{uneven} のセルの数が columns の {width} 個と違う"
    return None


def repeated_head_ids_problem(table: dict) -> str | None:
    """状況の表の見出しの id が、軸ごとに一意かを見る。行と列は別の名前空間なので、行と列で同じ id は書ける。"""
    problems = []
    for axis in ("rowHeads", "columnHeads"):
        twice = repeated([head["id"] for head in table[axis]])
        problems += [f"{axis} の id {', '.join(twice)} が 2 回以上ある"] if twice else []
    return " / ".join(problems) if problems else None


def outcome_grid_problem(table: dict) -> str | None:
    """状況の表のマスが、行の見出し × 列の見出しの組み合わせをちょうど 1 つずつ埋めているかを見る。

    @returns 見出しに無いマス・欠けた組み合わせ・2 回書いた組み合わせの説明。揃っていれば None
    """
    rows = [head["id"] for head in table["rowHeads"]]
    columns = [head["id"] for head in table["columnHeads"]]
    pairs = [(outcome["rowHead"], outcome["columnHead"]) for outcome in table["outcomes"]]
    spelled = lambda found: ", ".join(f"{row} × {column}" for row, column in found)
    stray = [pair for pair in pairs if pair[0] not in rows or pair[1] not in columns]
    missing = [(row, column) for row in rows for column in columns if (row, column) not in pairs]
    twice = repeated(pairs)
    problems = [
        *([f"見出しに無いマス {spelled(stray)}"] if stray else []),
        *([f"マス {spelled(missing)} が無い"] if missing else []),
        *([f"マス {spelled(twice)} を 2 回書いている"] if twice else []),
    ]
    return " / ".join(problems) if problems else None


def same_was_problem(outcome: dict) -> str | None:
    """マスの「これまで」(`was`)が今の結果(`result`)と同じでないかを見る。同じなら変わっていないので書かない。"""
    if outcome.get("was") == outcome["result"]:
        return "was が result と同じ(変わっていないマスには was を書かない)"
    return None


def same_sides_problem(value: dict) -> str | None:
    """前後(`before` / `after`)の文の並びがまったく同じでないかを見る。比べるのは文だけで、やりとり(`message`)は見ない。

    一部の行が同じなのは通す。変わらない行を文脈として並べるのは正しいため。
    """
    texts = lambda lines: [line["text"] for line in lines]
    if texts(value["before"]) == texts(value["after"]):
        return "before と after の文の並びが同じ(変わっていない)"
    return None


# キーごとの形が合ったオブジェクトに、キーをまたいで当てる規則。
CrossChecks: dict[str, tuple[Callable[[dict], str | None], ...]] = {
    "Note": (span_problem,),
    "Excerpt": (span_problem, excerpt_length_problem, emphasis_problem),
    "LineRange": (span_problem,),
    "Values": (cells_problem,),
    "SituationTable": (repeated_head_ids_problem, outcome_grid_problem),
    "SituationOutcome": (same_was_problem,),
    "ImpactChange": (same_sides_problem,),
    "AddedSituation": (same_sides_problem,),
}

# 一意でなければならない値(トップの一覧と、その中のキー)。
UniqueKeys = (
    ("features", "id"),
    ("layerRoles", "layer"),
    ("concepts", "path"),
    ("messages", "id"),
    ("flows", "id"),
    ("commitStories", "sha"),
    ("suites", "id"),
    ("tests", "id"),
    ("primers", "id"),
    ("terms", "id"),
    ("terms", "label"),
)


class Reference(NamedTuple):
    """解説の中の参照。`source` の値が、トップの一覧 `collection` のどれかの `key` と一致する。

    `source` はトップからの道筋で、`[]` は配列の各要素を指す。
    """

    source: str
    collection: str
    key: str


References = (
    Reference("messages[].from", "concepts", "path"),
    Reference("messages[].to", "concepts", "path"),
    Reference("flows[].steps[]", "messages", "id"),
    Reference("commitStories[].flows[]", "flows", "id"),
    Reference("overview.before[].message", "messages", "id"),
    Reference("overview.after[].message", "messages", "id"),
    Reference("commitStories[].before[].message", "messages", "id"),
    Reference("commitStories[].after[].message", "messages", "id"),
    Reference("tests[].suite", "suites", "id"),
    Reference("tests[].covers[]", "messages", "id"),
    Reference("tests[].targets[]", "concepts", "path"),
    Reference("concepts[].feature", "features", "id"),
    Reference("impact.changed.before[].message", "messages", "id"),
    Reference("impact.changed.after[].message", "messages", "id"),
    Reference("impact.tables[].outcomes[].tests[]", "tests", "id"),
    Reference("impact.added[].before[].message", "messages", "id"),
    Reference("impact.added[].after[].message", "messages", "id"),
    Reference("impact.added[].tests[]", "tests", "id"),
    Reference("impact.kept[].tests[]", "tests", "id"),
    Reference("primers[].seeAlso[]", "primers", "id"),
    Reference("primers[].tests[]", "tests", "id"),
    Reference("primers[].flows[]", "flows", "id"),
)

# Target の kind のうち、解説の中の一覧を指すもの(layer / file は地図を指す参照)。
TargetCollections = {"feature": "features", "message": "messages", "flow": "flows"}


def keep_first_or_mark(pairs: list[tuple[str, object]]) -> dict | Duplicated:
    """`json.loads` の `object_pairs_hook`。キーが重複していれば `Duplicated` に置き換える。"""
    twice = tuple(repeated([key for key, _ in pairs]))
    return Duplicated(twice) if twice else dict(pairs)


def parse(raw: bytes) -> tuple[object, str | None]:
    """解説の JSON を読む。

    @param raw 解説のファイルの中身
    @returns 読んだ値と、読めなかった理由(読めたら None)
    """
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=keep_first_or_mark), None
    except UnicodeDecodeError as error:
        return None, f"UTF-8 として読めない({error})"
    except json.JSONDecodeError as error:
        return None, f"JSON として読めない({error})"


def value_problems(value: object, rule: object, where: str) -> list[str]:
    """値が規則に合わない理由を集める。

    @param value 検査する値
    @param rule `Scalar` / `Word` / `Many` / `Shape` / `Variant` のどれか
    @param where 報告に出す、トップからの道筋
    @returns 違反の説明。無ければ空
    """
    if isinstance(value, Duplicated):
        return [f"{where}: キー {', '.join(value.keys)} が重複している"]
    if isinstance(rule, Scalar):
        holds, description = ScalarRules[rule.rule]
        return [] if holds(value) else [f"{where}: {description}で書く(今は {json.dumps(value, ensure_ascii=False)})"]
    if isinstance(rule, Word):
        return [] if value in rule.words else [f"{where}: {' / '.join(rule.words)} のどれか(今は {json.dumps(value, ensure_ascii=False)})"]
    if isinstance(rule, Many):
        return list_problems(value, rule, where)
    if isinstance(rule, Variant):
        return variant_problems(value, Variants[rule.name], where)
    return object_problems(value, rule.name, where)


def list_problems(value: object, rule: Many, where: str) -> list[str]:
    """配列の規則(件数・重複・各要素)に合わない理由を集める。"""
    if not isinstance(value, list):
        return [f"{where}: 配列で書く"]
    if len(value) < rule.least:
        return [f"{where}: {rule.least} 件以上書く"]
    items = [problem for index, item in enumerate(value) for problem in value_problems(item, rule.item, f"{where}[{index}]")]
    has_twice = rule.distinct and len({json.dumps(item) for item in value}) != len(value)
    return items + ([f"{where}: 同じ値を 2 回書かない"] if has_twice else [])


def fields_problems(value: dict, fields: dict[str, Field], where: str) -> list[str]:
    """オブジェクトのキーが表と合わない理由(欠け・知らないキー・各値)を集める。"""
    missing = [f"{where}: {key} が無い" for key, field in fields.items() if field.required if key not in value]
    unknown = [f"{where}: 知らないキー {key}" for key in value if key not in fields]
    values = [problem for key, field in fields.items() if key in value for problem in value_problems(value[key], field.value, f"{where}.{key}")]
    return missing + unknown + values


def object_problems(value: object, name: str, where: str) -> list[str]:
    """`Shapes` の名前のオブジェクトに合わない理由を集める。キーごとに合っていれば、キーをまたぐ規則も当てる。"""
    if not isinstance(value, dict):
        return [f"{where}: オブジェクト({name})で書く"]
    problems = fields_problems(value, Shapes[name], where)
    if problems:
        return problems
    crossed = [check(value) for check in CrossChecks.get(name, ())]
    return [f"{where}: {problem}" for problem in crossed if problem]


def variant_problems(value: object, variants: dict[str, dict[str, Field]], where: str) -> list[str]:
    """`kind` で形が決まるオブジェクトに合わない理由を集める。"""
    if not isinstance(value, dict):
        return [f"{where}: オブジェクトで書く"]
    kind = value.get("kind")
    if kind not in variants:
        return [f"{where}.kind: {' / '.join(variants)} のどれか(今は {json.dumps(kind, ensure_ascii=False)})"]
    fields = {"kind": need(Word(tuple(variants))), **variants[kind]}
    return fields_problems(value, fields, where)


def uniqueness_problems(explain: dict) -> list[str]:
    """一意でなければならない値の重複を集める。

    @param explain 形の検査を通った解説
    """
    problems = []
    for collection, key in UniqueKeys:
        twice = repeated([item[key] for item in explain.get(collection, [])])
        problems += [f"{collection}[].{key}: {value} が 2 回以上ある" for value in twice]
    return problems


def shape_problems(explain: object) -> list[str]:
    """解説の形の違反を集める。"""
    problems = value_problems(explain, Shape("Explain"), "explain")
    return problems if problems else uniqueness_problems(explain)


def fields_of(rule: Shape | Variant) -> dict[str, Field]:
    """オブジェクトの規則が持つキー。Variant は kind のキーを kind の順に合わせる(同じキーは kind をまたいで同じ規則)。"""
    if isinstance(rule, Shape):
        return Shapes[rule.name]
    return {key: field for fields in Variants[rule.name].values() for key, field in fields.items()}


def routes_under(rule: object, route: str) -> list[tuple[str, object, bool]]:
    """規則の下にある道筋を、外側から書いた順に集める(`Shapes` と `Variants` を辿る)。判定表と、印・抜粋の道筋を導く検査
    (`term_mark_problems`・`with_read_excerpts`)が使う。

    @param rule `Field` の `value` に書く規則
    @param route その規則の道筋(`impact` など)。配列の中へ進む段には `[]` を付ける
    @returns `(道筋, 配列なら要素の規則, 配列か)` の並び
    """
    is_many = isinstance(rule, Many)
    inner = rule.item if is_many else rule
    if not isinstance(inner, (Shape, Variant)):
        return [(route, inner, is_many)]
    prefix = f"{route}[]" if is_many else route
    nested = [found for key, field in fields_of(inner).items() for found in routes_under(field.value, f"{prefix}.{key}")]
    return [(route, inner, is_many), *nested]


def routes_with(rule: object) -> list[str]:
    """解説(Explain)の下で、規則が `rule` の道筋を、外側から書いた順に集める。配列なら要素の規則で見る。"""
    return [route for key, field in Shapes["Explain"].items() for route, inner, _ in routes_under(field.value, key) if inner == rule]


class Step(NamedTuple):
    """道筋(`a[].b`)の 1 段。`key` はキー、`is_each` は配列の各要素へ進むか、`where` は起点からそのキーまでの綴り。"""

    key: str
    is_each: bool
    where: str

    def item_where(self, index: int) -> str:
        """配列の `index` 番目の要素までの綴り。"""
        return f"{self.where}[{index}]"


def step_of(step: str, where: str) -> Step:
    """道筋の 1 段を読む(`[]` で終わる段は配列の各要素へ進む)。

    @param where 起点からその段の手前までの綴り
    """
    key = step.removesuffix("[]")
    return Step(key, step.endswith("[]"), f"{where}.{key}" if where else key)


def values_at(value: object, route: list[str], where: str) -> list[tuple[str, object]]:
    """道筋の先にある値を、道筋の綴りと一緒に集める。途中で欠けているものは飛ばす。

    @param value 道筋の起点
    @param route `.` で割った道筋
    @param where 起点までの綴り
    """
    if not route:
        return [(where, value)]
    step = step_of(route[0], where)
    if step.key not in value:
        return []
    inner = value[step.key]
    if not step.is_each:
        return values_at(inner, route[1:], step.where)
    return [found for index, item in enumerate(inner) for found in values_at(item, route[1:], step.item_where(index))]


def reference_problems(explain: dict) -> list[str]:
    """解説の中の参照切れと、未実装のテストが持てないキーを集める。

    @param explain 形の検査を通った解説
    """
    known = lambda collection, key: {item[key] for item in explain.get(collection, [])}
    problems = [
        f"{where}: {value} が {reference.collection} に無い"
        for reference in References
        for where, value in values_at(explain, reference.source.split("."), "")
        if value not in known(reference.collection, reference.key)
    ]
    for where, go in values_at(explain, ["overview", "highlights[]", "go"], ""):
        collection = TargetCollections.get(go["kind"])
        is_dangling = collection is not None and go["id"] not in known(collection, "id")
        problems += [f"{where}.id: {go['id']} が {collection} に無い"] if is_dangling else []
    todo_with_code = [
        f"tests[{index}]: todo のテストは commit も excerpt も持たない"
        for index, test in enumerate(explain.get("tests", []))
        if is_todo_with_code(test)
    ]
    return problems + todo_with_code + term_mark_problems(explain)


def term_mark_problems(explain: dict) -> list[str]:
    """用語の印が terms に無いものと、どの印からも指されない用語を集める。

    @param explain 形の検査を通った解説
    """
    known = {term["id"] for term in explain.get("terms", [])}
    marks = [
        (where, term_id)
        for route in routes_with(MarkedText)
        for where, text in values_at(explain, route.split("."), "")
        for _, term_id in TermMarkPattern.findall(text)
    ]
    dangling = [f"{where}: 用語の印 {term_id} が terms に無い" for where, term_id in marks if term_id not in known]
    marked = {term_id for _, term_id in marks}
    unmarked = [f"terms[{index}]: 用語 {term['id']} を指す印が無い" for index, term in enumerate(explain.get("terms", [])) if term["id"] not in marked]
    return dangling + unmarked


def is_todo_with_code(test: dict) -> bool:
    """未実装(`todo`)のテストが、実装を指すキー(`commit` / `excerpt`)を持っているか。"""
    points_at_code = "commit" in test or "excerpt" in test
    return test.get("todo", False) and points_at_code


def git(repo: str, *args: str) -> subprocess.CompletedProcess:
    """`repo` で git を走らせる。"""
    return subprocess.run(["git", "-C", repo, *args], capture_output=True)


def lines_at(repo: str, sha: str, path: str) -> list[str] | None:
    """そのコミットのファイルを行に割って返す。

    @returns 行の並び(末尾に改行の無い最終行も 1 行)。そのコミットにファイルとして無ければ None
    """
    kind = git(repo, "cat-file", "-t", f"{sha}:{path}")
    is_file = kind.returncode == 0 and kind.stdout.strip() == b"blob"
    if not is_file:
        return None
    text = git(repo, "cat-file", "blob", f"{sha}:{path}").stdout.decode("utf-8", errors="replace")
    lines = text.split("\n")
    return lines[:-1] if lines[-1] == "" else lines


def read_excerpt(repo: str, sha: str, excerpt: dict) -> tuple[dict, None] | tuple[None, str]:
    """抜粋の範囲の中身を読む。

    @returns 読めたら、中身(`text`。行を改行でつないだもの)を足した抜粋と None。埋め込みの中から始まるなら、開いた行
        (`openingLine`)も足す。ファイルが無い・範囲が収まらないときは、None と読めなかった理由
    """
    lines = lines_at(repo, sha, excerpt["path"])
    if lines is None:
        return None, f"{excerpt['path']} は {sha} に無い"
    if excerpt["end"] > len(lines):
        return None, f"{excerpt['path']} は {len(lines)} 行で、{excerpt['start']}-{excerpt['end']} 行目は収まらない"
    filled = {**excerpt, "text": "\n".join(lines[excerpt["start"] - 1:excerpt["end"]])}
    opening = opening_lines(excerpt["path"], lines)[excerpt["start"] - 1]
    return (filled if opening is None else {**filled, "openingLine": opening}), None


def read_along(value: object, route: str, read: Callable[[dict, str], tuple[dict, list[str]]]) -> tuple[object, list[str]]:
    """道筋の先の抜粋を `read` で読み直した写しと、読めなかった違反を返す。途中で欠けているものはそのまま残す。

    @param route 解説の起点からの道筋(`[]` で終わる段は配列の各要素へ進む)
    @param read 抜粋と、その道筋の綴りを受け取り、中身を足した抜粋と違反を返す
    """

    def walk(value: object, steps: list[str], where: str) -> tuple[object, list[str]]:
        if not steps:
            return read(value, where)
        step = step_of(steps[0], where)
        if step.key not in value:
            return value, []
        if not step.is_each:
            inner, problems = walk(value[step.key], steps[1:], step.where)
            return {**value, step.key: inner}, problems
        read_items = [walk(item, steps[1:], step.item_where(index)) for index, item in enumerate(value[step.key])]
        return {**value, step.key: [item for item, _ in read_items]}, [problem for _, problems in read_items for problem in problems]

    return walk(value, route.split("."), "")


def with_read_excerpts(explain: dict, repo: str) -> tuple[dict, list[str]]:
    """抜粋(Excerpt を指すすべての道筋)に中身(`text`)と、埋め込みの中から始まるものには開いた行(`openingLine`)を足した
    解説と、読めなかった抜粋の違反を返す。抜粋の無い解説は、キーの順まで同じまま返す。

    @param explain 形と参照の検査を通った解説
    @param repo 解説時点の sha を持つリポジトリ
    """
    sha = explain["sha"]
    if git(repo, "cat-file", "-e", f"{sha}^{{commit}}").returncode != 0:
        return explain, [f"sha {sha} がこのリポジトリに無い(解説時点の head を push・fetch してから)"]

    def read(excerpt: dict, where: str) -> tuple[dict, list[str]]:
        filled_excerpt, problem = read_excerpt(repo, sha, excerpt)
        return (excerpt, [f"{where}: {problem}"]) if filled_excerpt is None else (filled_excerpt, [])

    def read_route(sofar: tuple[dict, list[str]], route: str) -> tuple[dict, list[str]]:
        written, problems = read_along(sofar[0], route, read)
        return written, sofar[1] + problems

    return reduce(read_route, routes_with(Shape("Excerpt")), (explain, []))


def primer_code_problems(explain: dict) -> list[str]:
    """読み出し済みの解説で、各技術の節に空白以外の実コードの抜粋があるかを見る。"""
    problems = []
    for index, primer in enumerate(explain.get("primers", [])):
        has_code = any(
            passage["kind"] == "excerpt" and passage["excerpt"]["text"].strip()
            for passage in primer.get("passages", [])
        )
        if not has_code:
            problems.append(f"primers[{index}] ({primer['id']}): 対象 sha の空白以外の本文を持つ excerpt が 1 件以上必要")
    return problems


def collect_violations(explain: object, pr: int, repo: str) -> tuple[dict | None, list[str]]:
    """解説を検査し、書き出す値と報告の行を返す。

    @param explain 読んだ解説(読めなかったら None)
    @param pr 公開先の PR 番号
    @param repo 解説時点の sha を持つリポジトリ
    @returns 抜粋の中身を足した解説(違反があれば None)と、報告の行
    """
    shape = shape_problems(explain)
    if shape:
        return None, [f"[pr-explain-shape] {problem}" for problem in shape]
    meta = [] if explain["pr"] == pr else [f"[pr-explain-meta] pr が公開先の PR #{pr} と違う(今は {explain['pr']})"]
    refs = [f"[pr-explain-ref] {problem}" for problem in reference_problems(explain)]
    written, code = with_read_excerpts(explain, repo)
    if not code:
        code = primer_code_problems(written)
    violations = meta + refs + [f"[pr-explain-code] {problem}" for problem in code]
    return (None if violations else written), violations


def parse_args(argv: list[str]) -> dict[str, str] | None:
    """`<explain.json> --pr <番号> --out <先> [--repo <リポジトリ>]` を読む。読めなければ None。"""
    if len(argv) < 2:
        return None
    options = dict(zip(argv[2::2], argv[3::2]))
    is_complete = len(argv) % 2 == 0 and set(options) <= {"--pr", "--out", "--repo"} and {"--pr", "--out"} <= set(options)
    is_valid = is_complete and re.fullmatch(r"[1-9][0-9]*", options["--pr"]) is not None and Path(argv[1]).is_file()
    return {**options, "explain": argv[1]} if is_valid else None


def main(argv: list[str]) -> int:
    options = parse_args(argv)
    if options is None:
        print("使い方: build-pr-explain.py <explain.json> --pr <番号> --out <書き出す先> [--repo <リポジトリ>]", file=sys.stderr)
        return 2
    explain, unreadable = parse(Path(options["explain"]).read_bytes())
    if unreadable:
        print(f"[pr-explain-shape] {unreadable}")
        return 1
    written, violations = collect_violations(explain, int(options["--pr"]), options.get("--repo", "."))
    for violation in violations:
        print(violation)
    if violations:
        return 1
    Path(options["--out"]).write_text(json.dumps(written, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
