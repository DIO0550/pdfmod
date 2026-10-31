#!/usr/bin/env python3
"""PR の解説ページの色分けで、途中の行から読み始める位置に効いている埋め込みを、それを開いた行で返す。

ページは抜粋・差分の hunk を途中の行から色分けするので、その行が HTML の script / style 要素や、シェルの
JS・TS・PY・JSON のヒアドキュメントの中にあるかを知らない。解説の検査(`build-pr-explain.py`)と変更の地図
(`build-pr-change-map.py`)が、それを開いた行を書き出し、ページはその行から読み始める。語と、判定表・テンプレート・見本の
各行の開いた行は `pr-explain-core-cases.sh` がページの `Tokenizer` と突き合わせる。

- 要素は、行の中の開きと閉じを左から順に見る。開いていなければ開きを取り、開いていれば同じ名前の閉じで閉じる
- ヒアドキュメントは、中にいる間は区切りの行(`<<-` で開いたものは行頭のタブを除く)だけを見て、他の開きは見ない。
  外にいれば、行の中の最初の `<<` の区切りの語が `HeredocDelimiters` にあるときだけ開く。`<<` は行の生の文字で探すので、
  文字列・コメントの中でも開く

ページと規則が揃っているのは、ヒアドキュメントの開閉と、要素名・区切りの語・拡張子の集合。要素は、ここが生の行の綴りで探し、
ページはタグの字句で探すので、HTML のコメント・属性値の中の綴りで食い違う。1 行のコメント(`<!-- <script> -->`)はここだけが
開いたと読み、ページは開いた行を読み直して開いていないと読む(その後ろの本物の要素の中から始まる抜粋・hunk は色が付かない)。
複数行のコメントの中の開きタグを開いた行として渡すと、ページはコメントの閉じた後も JS で読む。

**ファイル名だけアンダースコア。** `ts_sources.py` と同じ理由で、ハイフンを含む名前は Python のモジュールとして
import できない。
"""

import re
from typing import NamedTuple

# 中を別の言語で読む HTML の要素(小文字)と、シェルのヒアドキュメントの区切りの語。ページの `Tokenizer.Embeddings` と同じ。
EmbeddingElements = ("script", "style")
HeredocDelimiters = ("JS", "TS", "PY", "JSON")

# 埋め込みを持つファイルの拡張子。要素は HTML、ヒアドキュメントはシェルだけで読む。
ElementExtensions = (".html",)
HeredocExtensions = (".sh", ".bash")

_names = "|".join(EmbeddingElements)
ElementTag = re.compile(rf"<({_names})\b[^>]*>|</({_names})", re.IGNORECASE)
HeredocStart = re.compile(r"<<(-?)[ \t]*(['\"]?)([A-Za-z_]\w*)\2")


class Region(NamedTuple):
    """開いている埋め込み。"""

    line: str  # それを開いた行
    name: str  # 要素名(小文字)か、ヒアドキュメントの区切りの語
    strips_tabs: bool = False  # `<<-` で開いたヒアドキュメント(区切りの行の行頭のタブを除いて比べる)


def _element_after(line: str, region: Region | None) -> Region | None:
    """行を読み終えた後に開いている要素。"""
    for match in ElementTag.finditer(line):
        opens, closes = match.group(1), match.group(2)
        closes_region = closes is not None and region is not None and closes.lower() == region.name
        opens_new = opens is not None and region is None
        if opens_new:
            region = Region(line, opens.lower())
        elif closes_region:
            region = None
    return region


def _heredoc_after(line: str, region: Region | None) -> Region | None:
    """行を読み終えた後に開いているヒアドキュメント。"""
    if region is not None:
        closing = line.lstrip("\t") if region.strips_tabs else line
        return None if closing == region.name else region
    match = HeredocStart.search(line)
    is_known = match is not None and match.group(3) in HeredocDelimiters
    if not is_known:
        return None
    return Region(line, match.group(3), match.group(1) == "-")


def has_embedding_rules(path: str) -> bool:
    """そのパスのファイルに、埋め込みを読む規則があるか(拡張子で決める)。"""
    return path.endswith(ElementExtensions + HeredocExtensions)


def opening_lines(path: str, lines: list[str]) -> list[str | None]:
    """各行の頭で効いている埋め込みを開いた行。

    @param path ファイルのパス(拡張子で、要素とヒアドキュメントのどちらを読むかを決める)
    @param lines ファイルの行
    @returns 行ごとの開いた行。その行の頭で埋め込みの外にいる行と、埋め込みの無い拡張子のファイルの行は None
    """
    after = _element_after if path.endswith(ElementExtensions) else _heredoc_after if path.endswith(HeredocExtensions) else None
    if after is None:
        return [None] * len(lines)
    openings: list[str | None] = []
    region = None
    for line in lines:
        openings.append(None if region is None else region.line)
        region = after(line, region)
    return openings
