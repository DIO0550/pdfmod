#!/usr/bin/env python3
"""解説ページの枠(`.github/pr-explain/templates/index.html`)の CSP と固定スクリプトを検査する。

ページは変更の地図(`change-map.json`)と解説(`explain.json`)を読み、固定スクリプトが
`createElement` と `textContent` で組む。JSON の中身は差分のコードや PR の本文をそのまま含むので、
**固定スクリプトが HTML として解釈させる API を 1 か所でも使えば、そこから中身が要素になる。**
それを語の有無で止める。CSP は、すり抜けた要素があっても、固定スクリプト以外のスクリプトの実行・
外からの読み込み・フォームの送信を止める。インラインの style は止めない
(`style-src 'unsafe-inline'`。ページが位置と幅を style で付けるため)。報告する違反は 2 つ。

- `pr-explain-csp` — CSP が `Policy` の表を外れている(表に無いディレクティブ・同じディレクティブの重複・
  表に無い出どころ・必須の欠け)か、`script-src` が固定スクリプトのハッシュ 1 つだけになっていない
  (固定スクリプトは 1 本)
- `pr-explain-template` — 固定スクリプトが `ForbiddenWords` の語を使っている。語として見るので、
  コメントの中の綴りも落とす

固定スクリプトは別の `.js` に出さず、HTML の中に置いてハッシュで許す。別のファイルにすると
`script-src 'self'` が要り、同じ origin(gh-pages の他の公開コンテンツ)にあるどの `.js` も
動かせるようになる。

使い方:
    check-pr-explain-template.py <テンプレート>

違反が無ければ終了コード 0。違反があれば標準出力へ報告して 1。引数の誤りは 2。
"""

import base64
import hashlib
import re
import sys
from pathlib import Path

ScriptTag = re.compile(r"<script\b", re.I)
InlineScript = re.compile(r"<script>(.*?)</script>", re.S)
CspMeta = re.compile(r'<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"', re.I)
ScriptHash = re.compile(r"'sha256-([A-Za-z0-9+/]+={0,2})'")

# 文字列を HTML として解釈させる API。
ForbiddenWords = (
    "innerHTML",
    "outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "document.writeln",
    "DOMParser",
    "createContextualFragment",
    "setHTMLUnsafe",
    "parseHTMLUnsafe",
    "srcdoc",
)

# 書いてよいディレクティブと、それぞれが許す出どころ。`script-src` の出どころは固定スクリプトのハッシュで、
# `script_problems` が見る。ここに無いディレクティブ(`script-src-elem` など)は、書けば違反にする。
Policy = {
    "default-src": frozenset({"'none'"}),
    "script-src": None,
    "style-src": frozenset({"'unsafe-inline'"}),
    "font-src": frozenset({"'none'"}),
    # 2 つの JSON を同じフォルダから読む。
    "connect-src": frozenset({"'self'"}),
    "img-src": frozenset({"'self'", "data:"}),
    "base-uri": frozenset({"'none'"}),
    "form-action": frozenset({"'none'"}),
}

# 出どころをちょうどこのとおりに書かなければならないディレクティブ。
RequiredExactly = ("default-src", "connect-src")


def word_pattern(word: str) -> re.Pattern:
    """語として見る正規表現(前後が識別子の文字でない)。`.` の前後の空白も同じ語とみなす。"""
    spelled = r"\s*\.\s*".join(re.escape(part) for part in word.split("."))
    return re.compile(rf"(?<![\w$]){spelled}(?![\w$])")


def directives_of(policy: str) -> list[tuple[str, list[str]]]:
    """CSP をディレクティブ名と出どころの並びに割る。同じ名前が 2 回あれば 2 つのまま返す。"""
    parts = [part.split() for part in policy.split(";") if part.strip()]
    return [(part[0].lower(), part[1:]) for part in parts]


def script_problems(template: str, directives: dict[str, list[str]]) -> list[str]:
    """固定スクリプトが 1 本で、`script-src` がそのハッシュだけを許しているかを見る。"""
    scripts = InlineScript.findall(template)
    tags = len(ScriptTag.findall(template))
    is_single_script = tags == 1 and len(scripts) == 1
    if not is_single_script:
        return [f"固定スクリプトは属性の無い <script> 1 本だけにする(今は <script 始まりが {tags} 個)"]
    sources = directives.get("script-src", [])
    hashes = [ScriptHash.fullmatch(source) for source in sources]
    is_single_hash = len(sources) == 1 and hashes[0] is not None
    if not is_single_hash:
        return [f"script-src は 'sha256-…' 1 つだけにする(今は {' '.join(sources) or '無し'})"]
    actual = base64.b64encode(hashlib.sha256(scripts[0].encode("utf-8")).digest()).decode("ascii")
    if hashes[0].group(1) != actual:
        return [f"script-src は sha256-{hashes[0].group(1)} を許しているが、固定スクリプトは sha256-{actual}"]
    return []


def directive_problems(pairs: list[tuple[str, list[str]]]) -> list[str]:
    """表に無いディレクティブと、2 回以上書いたディレクティブを集める(ブラウザは 2 つ目以降を読まない)。"""
    names = [name for name, _ in pairs]
    unknown = [f"{name} は書かない(書いてよいのは {' / '.join(Policy)})" for name in dict.fromkeys(names) if name not in Policy]
    repeated = [f"{name} を {names.count(name)} 回書いている(1 回だけにする)" for name in dict.fromkeys(names) if names.count(name) > 1]
    return unknown + repeated


def source_problems(directives: dict[str, list[str]]) -> list[str]:
    """`script-src` 以外のディレクティブが許す出どころを見る。"""
    missing = [
        f"{name} が無いか違う({' '.join(sorted(Policy[name]))} だけを書く)"
        for name in RequiredExactly
        if set(directives.get(name, [])) != Policy[name]
    ]
    extra = {name: set(directives.get(name, [])) - allowed for name, allowed in Policy.items() if allowed is not None}
    wrong = [
        f"{name} に許していない出どころ {' '.join(sorted(sources))}(許すのは {' / '.join(sorted(Policy[name]))})"
        for name, sources in extra.items()
        if sources
    ]
    return missing + wrong


def csp_problems(template: str) -> list[str]:
    """CSP の違反を集める。"""
    policies = CspMeta.findall(template)
    if len(policies) != 1:
        return [f"CSP の <meta> は 1 つだけ置く(今は {len(policies)} 個)"]
    pairs = directives_of(policies[0])
    directives = dict(pairs)
    return directive_problems(pairs) + script_problems(template, directives) + source_problems(directives)


def word_problems(template: str) -> list[str]:
    """固定スクリプトが使っている、HTML として解釈させる API を集める。"""
    script = "".join(InlineScript.findall(template))
    return [f"固定スクリプトが {word} を使っている(textContent と createElement で組む)" for word in ForbiddenWords if word_pattern(word).search(script)]


def main(argv: list[str]) -> int:
    is_valid_call = len(argv) == 2 and Path(argv[1]).is_file()
    if not is_valid_call:
        print("使い方: check-pr-explain-template.py <テンプレート>", file=sys.stderr)
        return 2
    template = Path(argv[1]).read_text(encoding="utf-8")
    violations = [f"[pr-explain-csp] {problem}" for problem in csp_problems(template)]
    violations += [f"[pr-explain-template] {problem}" for problem in word_problems(template)]
    for violation in violations:
        print(violation)
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
