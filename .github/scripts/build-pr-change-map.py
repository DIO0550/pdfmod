#!/usr/bin/env python3
"""PR の差分から変更の地図(change-map.json version 2)を作る。

merge-base から head のファイル・コミット・差分、Vitest / Rust / Python unittest の
静的なテスト宣言名の増減を集める。rename だけで増減させない。
テストの実行結果・型解決・マクロ展開・動的なテスト名は判定しない。
依存は相対 import、Python import、明示されたファイル参照だけを扱う。
Markdown・バイナリ・長すぎるファイルは依存の解析対象外。

使い方: build-pr-change-map.py --base <ref> --head <ref> --pr <番号> --head-branch <名前> --base-branch <名前>
標準出力へ JSON。Git の失敗は 1、引数の誤りは 2。
"""

import ast
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from embedded_regions import has_embedding_rules, opening_lines

HarnessPaths = ("AGENTS.md", "CLAUDE.md", "rules/", ".agents/", ".claude/", ".github/", "harness/")
# Rust は同じファイル内の #[test] も拾う。テスト専用ファイルとは限らない。
TestFile = re.compile(r"\.(?:test|spec)\.[cm]?[jt]sx?$|\.rs$|^harness/tests/test_.*\.py$")
StatusLetters = {"A": "A", "M": "M", "D": "D", "R": "R", "C": "A", "T": "M"}

ScriptSuffixes = (".rs", ".ts", ".tsx", ".js", ".mjs", ".jsx")
COMMENT_LINE = re.compile(r"^\s*//")
PythonImport = re.compile(r"^[ \t]*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))", re.M)
# 説明として落とすもの。`#` だけの行と // 行コメント、行末の
# `#` / `//` のコメント(前後に空白があるものだけ。URL の `//` やシェルの `$#` を落とさない)、
# `/* */`(JSX の `{/* */}` を含む)、Python の docstring。
HashCommentLine = re.compile(r"^\s*#")
TrailingComment = re.compile(r"[ \t]+(?:#|//)[ \t].*$", re.M)
BlockComment = re.compile(r"/\*[\s\S]*?\*/")
Docstring = re.compile(r'("""|\'\'\')[\s\S]*?\1')
# パスとして読める字句(フォルダをシェル変数で書いた `$dir/x.py` `${dir}/x.py` を含む)と、その変数の前置き。
PathToken = re.compile(r"[\w./${}-]+")
VariablePrefix = re.compile(r"^\$\{?\w+\}?/")
# これより長い(文字数)ファイルは依存を探しに読まない(生成物のフィクスチャなどで地図づくりを遅らせない)。
MaxSourceCharacters = 1_000_000
# 先頭のこのバイト数に NUL があればバイナリとみなす(git が差分でバイナリとみなすのと同じ幅)。
BinaryProbeBytes = 8000
# コミットのファイルごとの差分は、この行数で切る。
MaxPatchLines = 2000
# コミットの読み出し。`git log -z` はコミットの間に NUL を挟むので、欄も NUL で区切れば 6 つずつに割れる。
CommitFields = ("%H", "%P", "%an", "%aI", "%s", "%b")
CommitFormat = "%x00".join(CommitFields)
# 引数の名前。どれも必須。
Options = ("--base", "--head", "--pr", "--head-branch", "--base-branch")


class PullRequest(NamedTuple):
    """地図を作る PR。

    `base` / `head` はコミットを指す綴り(sha か ref)、`base_branch` / `head_branch` は地図に載せるブランチ名。
    """

    number: int
    base: str
    head: str
    base_branch: str
    head_branch: str


class PathLookup(NamedTuple):
    """ある時点で依存の行き先になりうるファイルと、それを名前から引く表。

    `siblings` はフォルダ → ファイル名 → パス(`index.*` を除く)、`modules` は `.py` のモジュール名 → パス。
    """

    paths: frozenset[str]
    siblings: dict[str, dict[str, str]]
    modules: dict[str, frozenset[str]]


class UnreadableBlobError(Exception):
    """`ls-tree` が返したのに中身を読めない blob があった(リポジトリのオブジェクトが欠けている)。`main` が捕まえて短く報告する。

    `git()` と同じく、地図を半端に作らないための例外。`main` → `build_map` → `snapshots_at` と深く渡り、途中で分岐して続ける
    呼び出し側が無いので、Result にはしない。
    """


def git(*args: str) -> str:
    """git を走らせて標準出力を返す。失敗したら例外のまま落とす(地図を半端に作らない)。

    UTF-8 として読めないバイトは置き換える(Shift_JIS のファイルや壊れたフィクスチャが 1 つあるだけで、
    地図全体を作れなくしない)。
    """
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True, errors="replace").stdout


def read_string(text: str, start: int) -> tuple[str, int] | None:
    """`start` から始まる文字列リテラルを読む。

    @param text ファイルの中身
    @param start 引用符の位置
    @returns (中身, 閉じ引用符の次の位置)。閉じていなければ None
    """
    quote = text[start]
    index = start + 1
    chars: list[str] = []
    while index < len(text):
        char = text[index]
        if char == "\\":
            chars.append(text[index : index + 2])
            index += 2
            continue
        if char == quote:
            return "".join(chars), index + 1
        chars.append(char)
        index += 1
    return None


def skip_parens(text: str, start: int) -> int | None:
    """`start`(開き括弧の直後)から、対応する閉じ括弧の次の位置を返す。文字列の中の括弧は数えない。

    @returns 対応する閉じ括弧が無ければ None
    """
    depth = 1
    index = start
    while index < len(text):
        char = text[index]
        if char in "'\"`":
            literal = read_string(text, index)
            if literal is None:
                return None
            index = literal[1]
            continue
        depth += {"(": 1, ")": -1}.get(char, 0)
        index += 1
        if depth == 0:
            return index
    return None


def lexical_parts(text: str, rust: bool = False) -> tuple[str, dict[int, tuple[str, int]]]:
    """コメントと文字列を空白にし、静的な文字列の位置を別に保持する。コードは実行しない。"""
    chars = list(text)
    literals = {}
    index = 0
    while index < len(text):
        start = index
        end = None
        if text.startswith("//", index):
            end = text.find("\n", index)
            if end < 0:
                end = len(text)
        elif text.startswith("/*", index):
            depth = 1
            end = index + 2
            while end < len(text) and depth:
                if rust and text.startswith("/*", end):
                    depth += 1
                    end += 2
                elif text.startswith("*/", end):
                    depth -= 1
                    end += 2
                else:
                    end += 1
        elif rust and (raw := re.match(r'(?:br|r)(#*)"', text[index:])):
            closing = '"' + raw[1]
            stop = text.find(closing, index + raw.end())
            end = len(text) if stop < 0 else stop + len(closing)
        elif text[index] in ('"', "'", "`"):
            # Rust の lifetime は文字列ではない。文字リテラルだけを除く。
            if rust and text[index] == "'" and not re.match(r"'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^'\\\n])'", text[index:]):
                index += 1
                continue
            literal = read_string(text, index)
            if literal:
                value, end = literal
                if text[index] != "`" or "${" not in value:
                    literals[start] = (value, end)
            else:
                end = len(text)
        if end is None:
            index += 1
            continue
        for position in range(start, end):
            if chars[position] != "\n":
                chars[position] = " "
        index = end
    return "".join(chars), literals


def test_names(text: str, path: str) -> set[str]:
    """静的な Vitest 名・#[test] 関数名・Python unittest 名を読む。実行件数ではない。"""
    if path.endswith(".py"):
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return set()
        return {node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_")}
    code, literals = lexical_parts(text, rust=path.endswith(".rs"))
    if path.endswith(".rs"):
        pattern = r"#\s*\[\s*test\s*\]\s*(?:#\s*\[[^]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*\("
        return set(re.findall(pattern, code))
    names = set()
    for call in re.finditer(r"(?<![\w$.])(?:test|it)\b", code):
        position = call.end()
        # skip / only / concurrent / each など、静的な修飾だけを見る。
        while modifier := re.match(r"\s*\.\s*(skip|only|todo|concurrent|sequential|fails|each|skipIf|runIf)\b", code[position:]):
            position += modifier.end()
            if modifier[1] in {"each", "skipIf", "runIf"}:
                opening = re.match(r"\s*\(", code[position:])
                if not opening:
                    break
                end = skip_parens(code, position + opening.end())
                if end is None:
                    break
                position = end
        opening = re.match(r"\s*\(", code[position:])
        if not opening:
            continue
        start = position + opening.end()
        while start < len(text) and text[start].isspace():
            start += 1
        literal = literals.get(start)
        if literal and re.match(r"\s*[,)]", text[literal[1]:]):
            names.add(literal[0])
    return names


def changed_files(base: str, head: str) -> list[dict]:
    """base..head で変わったファイルを、rename を 1 件にまとめて返す。"""
    statuses = git("diff", "-z", "-M", "--name-status", base, head).split("\0")
    counts = git("diff", "-z", "-M", "--numstat", base, head).split("\0")
    files: list[dict] = []
    index = 0
    while index < len(statuses) - 1:
        letter = statuses[index][0]
        renamed = letter in "RC"
        old_path = statuses[index + 1]
        path = statuses[index + 2] if renamed else old_path
        files.append({"path": path, "status": StatusLetters.get(letter, letter), "oldPath": old_path if letter == "R" else None})
        index += 3 if renamed else 2
    line_counts = numstat_by_path(counts)
    for file in files:
        file["additions"], file["deletions"] = line_counts[file["path"]]
    return files


def numstat_by_path(fields: list[str]) -> dict[str, tuple[int | None, int | None]]:
    """`--numstat -z` の出力を、新しいパスごとの追加・削除行数にする。バイナリは行数が無いので None。

    rename の行は `追加\\t削除\\t` の後に旧パスと新パスが別のフィールドで続く。
    """
    counts: dict[str, tuple[int | None, int | None]] = {}
    index = 0
    while index < len(fields) - 1:
        added, deleted, path = fields[index].split("\t", 2)
        step = 1
        if path == "":
            path = fields[index + 2]
            step = 3
        counts[path] = (int(added) if added.isdigit() else None, int(deleted) if deleted.isdigit() else None)
        index += step
    return counts


def layer_of(path: str) -> tuple[int, str, str]:
    """pdfmod の TypeScript / React / Rust / 仕様 / CI を分ける。"""
    layers = (
        ("packages/core/", "TypeScript · core"),
        ("packages/react/", "React"),
        ("rust/crates/", "Rust"),
        ("rust/", "Rust 設定"),
        ("docs/guides/", "PDF 仕様の解説"),
        ("docs/", "仕様・設計"),
    )
    for rank, (prefix, label) in enumerate(layers):
        if path.startswith(prefix):
            return rank, label, ""
    if path.startswith(HarnessPaths):
        return len(layers), "CI・開発支援", ""
    return len(layers) + 1, "設定・その他", ""


def kind_of(path: str) -> int:
    """同じ層では本体の後にテスト専用ファイルを置く。"""
    return int(bool(re.search(r"/__tests__/|/tests(?:/|\.rs$)|\.(?:test|spec)\.", path)) or path.startswith("harness/tests/"))


def target_of(path: str, paths: frozenset[str]) -> str | None:
    """テスト配置から対象が一意に分かるときだけ添える。名前による推測はしない。"""
    if "/__tests__/" in path:
        folder = path.split("/__tests__/", 1)[0]
        candidates = {folder + "/index.ts", folder + "/index.tsx"} & paths
        return next(iter(candidates)) if len(candidates) == 1 else None
    if path.endswith(".rs") and ("/tests/" in path or path.endswith("/tests.rs")):
        folder = re.split(r"/tests(?:/|\.rs$)", path, maxsplit=1)[0]
        candidates = {folder + ".rs", folder + "/mod.rs"} & paths
        return next(iter(candidates)) if len(candidates) == 1 else None
    return None


def listed_files(files: list[dict], dependencies: list[dict], paths: frozenset[str]) -> list[dict]:
    """層に載せるファイルを返す。変更ファイルと、依存の端に出る変更していないファイル(文脈ファイル)。

    @param files 変更ファイル(`changed_files` の戻り値)
    @param dependencies `dependencies_between` の戻り値
    @param paths head のすべてのファイル(テストの対象を探す範囲)
    @returns 変更ファイルは `changed: true` と `target`(`target_of` の戻り値)を足したもの。文脈ファイルは
        `{"path": パス, "changed": false}`
    """
    changed = [{**file, "changed": True, "target": target_of(file["path"], paths)} for file in files]
    changed_paths = {file["path"] for file in files}
    endpoints = {dependency[end] for dependency in dependencies for end in ("from", "to")}
    context = [{"path": path, "changed": False} for path in sorted(endpoints - changed_paths)]
    return changed + context


def group_files(files: list[dict]) -> list[dict]:
    """層に載せるファイル(`listed_files` の戻り値)を層ごとにまとめ、読む順に並べる。"""
    groups: dict[tuple[int, str, str], list[dict]] = {}
    for file in files:
        groups.setdefault(layer_of(file["path"]), []).append(file)
    return [
        {"label": label, "files": sorted(members, key=lambda file: (kind_of(file["path"]), file["path"]))}
        for (_, label, _), members in sorted(groups.items())
    ]


def test_changes(files: list[dict], before: dict[str, str | None], after: dict[str, str | None]) -> dict[str, list]:
    """テストファイルごとに、前後のテスト名の集合を比べて増減を出す。

    中身は依存を探すときに読んだものを使う(`MaxSourceCharacters` を超えるファイルは読まないので、テスト名も拾わない)。

    @param files 変更ファイル(`changed_files` の戻り値)
    @param before merge-base のすべてのファイル(`snapshots_at` の戻り値)
    @param after head のすべてのファイル
    @returns 増えたテスト(`added`)と減ったテスト(`removed`)の `{file, name}`、テスト名を調べたファイルのパス(`files`)
    """
    examined = [file for file in files if TestFile.search(file["path"]) or TestFile.search(file["oldPath"] or file["path"])]
    added: list[dict] = []
    removed: list[dict] = []
    for file in examined:
        names_before = test_names(before.get(file["oldPath"] or file["path"]) or "", file["oldPath"] or file["path"])
        names_after = test_names(after.get(file["path"]) or "", file["path"])
        added += [{"file": file["path"], "name": name} for name in sorted(names_after - names_before)]
        removed += [{"file": file["path"], "name": name} for name in sorted(names_before - names_after)]
    return {"added": added, "removed": removed, "files": [file["path"] for file in examined]}


def tree_at(revision: str) -> dict[str, str]:
    """ある時点のファイルを、パス → blob の名前の対応で返す(サブモジュールは除く)。"""
    entries = (entry.split("\t", 1) for entry in git("ls-tree", "-r", "-z", revision).split("\0")[:-1])
    return {path: meta.split(" ")[2] for meta, path in entries if meta.split(" ")[1] == "blob"}


def read_objects(names: list[str]) -> list[bytes | None]:
    """オブジェクトの名前(blob の名前・`<コミット>:<パス>` など)の中身を、`git cat-file --batch` を 1 回だけ走らせて、頼んだ順に読む。

    `cat-file` そのものが失敗したら `CalledProcessError` で落とす(地図を半端に作らない)。

    @param names オブジェクトの名前
    @returns 名前ごとの中身(`names` と同じ順)。無いもの・blob でないもの・改行を含む名前(`--batch` は 1 行に 1 つの名前で
        読むので頼まない)は None
    """
    asked = [name for name in names if "\n" not in name]
    request = "".join(f"{name}\n" for name in asked).encode()
    output = subprocess.run(["git", "cat-file", "--batch"], input=request, check=True, capture_output=True).stdout
    found: dict[str, bytes | None] = {}
    position = 0
    for name in asked:
        header_end = output.index(b"\n", position)
        header = output[position:header_end]
        position = header_end + 1
        if header.endswith((b" missing", b" ambiguous")):
            found[name] = None
            continue
        _, kind, size = header.rsplit(b" ", 2)
        found[name] = output[position : position + int(size)] if kind == b"blob" else None
        position += int(size) + 1
    return [found.get(name) for name in names]


def read_blobs(names: set[str]) -> dict[str, bytes]:
    """blob の中身を、`git cat-file --batch` を 1 回だけ走らせて読む。

    名前は `ls-tree` が返した blob に限るので、読めないものがあればリポジトリのオブジェクトが欠けている。除いて続けると
    依存の辺が黙って消えるので、`UnreadableBlobError` で落とす(地図を半端に作らない)。

    @param names blob の名前
    @returns 名前 → 中身
    """
    ordered = sorted(names)
    contents = dict(zip(ordered, read_objects(ordered)))
    missing = [name for name, content in contents.items() if content is None]
    if missing:
        raise UnreadableBlobError(f"blob を読めない: {' '.join(missing)}")
    return contents


def is_prose(path: str) -> bool:
    """Markdown か(説明の文章なので、依存を探しに読まない)。"""
    return path.endswith(".md")


def source_text(path: str, content: bytes | None) -> str | None:
    """依存を探しに読む中身を返す。

    @param path ファイルのパス
    @param content その中身。読んでいなければ None
    @returns UTF-8 として読んだ中身(読めないバイトは `git` と同じ理由で置き換える)。Markdown・バイナリ・
        `MaxSourceCharacters` を超えるものは None
    """
    unreadable = content is None or is_prose(path) or b"\0" in content[:BinaryProbeBytes]
    if unreadable:
        return None
    text = content.decode("utf-8", errors="replace")
    return text if len(text) <= MaxSourceCharacters else None


def snapshots_at(merge_base: str, head: str) -> tuple[dict[str, str | None], dict[str, str | None]]:
    """merge-base と head のすべてのファイルを、依存を探しに読む中身とともに返す。

    中身は 2 つの時点をまとめて 1 回で読む(同じ blob は 1 度だけ)。

    @returns (merge-base, head) のそれぞれで、パス → `source_text` の戻り値
    """
    trees = (tree_at(merge_base), tree_at(head))
    blobs = read_blobs({name for tree in trees for path, name in tree.items() if not is_prose(path)})
    before, after = ({path: source_text(path, blobs.get(name)) for path, name in tree.items()} for tree in trees)
    return before, after


def lookup_of(paths: frozenset[str]) -> PathLookup:
    """ある時点のすべてのファイルから、依存の行き先を名前で引く表を作る。"""
    siblings: dict[str, dict[str, str]] = {}
    modules: dict[str, set[str]] = {}
    for path in paths:
        name = posixpath.basename(path)
        if not name.startswith("index."):
            siblings.setdefault(posixpath.dirname(path), {})[name] = path
        if name.endswith(".py"):
            modules.setdefault(name[:-3], set()).add(path)
    return PathLookup(paths, siblings, {module: frozenset(found) for module, found in modules.items()})



def python_imported_paths(text: str, lookup: PathLookup) -> set[str]:
    """Python の import が指すファイル(モジュール名の最後の部分と同じ名前の `.py`)を返す。

    @param text import している側の中身(説明を落とした後)
    @param lookup 同じ時点のファイル
    """
    modules = {(match.group(1) or match.group(2)).split(".")[-1] for match in PythonImport.finditer(text)}
    return {path for module in modules for path in lookup.modules.get(module, frozenset())}


def code_of(source: str, text: str) -> str:
    """依存を探す範囲を返す。説明(コメント・docstring)を落とした中身。

    @param source 中身を読んだファイル(拡張子で、落とすものを決める)
    @param text その中身
    """
    if source.endswith(".rs"):
        return lexical_parts(text, rust=True)[0]
    code = Docstring.sub("", text) if source.endswith(".py") else text
    code = BlockComment.sub("", code) if source.endswith(ScriptSuffixes) else code
    lines = (line for line in code.split("\n") if not (COMMENT_LINE.match(line) or HashCommentLine.match(line)))
    return TrailingComment.sub("", "\n".join(lines))


def referenced_path(source: str, token: str, after_subshell: bool) -> str:
    """パスとして読める字句が指すパスを返す。

    `$dir/` `${dir}/` で始まるもの、`$(dirname "$0")` の直後の `/…` は、使う側のフォルダからの相対として解く。
    それ以外はそのまま(リポジトリのルートからのパスか、ファイル名だけ)。

    @param source 中身を読んだファイル
    @param token 字句
    @param after_subshell 字句の直前が `)` で、`/` から始まっているか
    """
    folder = posixpath.dirname(source)
    if after_subshell:
        return posixpath.normpath(posixpath.join(folder, token[1:]))
    if VariablePrefix.match(token):
        return posixpath.normpath(posixpath.join(folder, VariablePrefix.sub("", token)))
    return token


def mentioned_paths(source: str, text: str, lookup: PathLookup) -> set[str]:
    """中身にパスとして書かれているファイルを返す。

    字句の切れ目で分けるので、別のパスの一部(`x.py` に対する `ax.py`)には当たらない。本文は 1 回だけ
    走査する(ファイルの数だけ走査し直すと、Actions の時間を食う)。

    @param source 中身を読んだファイル
    @param text その中身(説明を落とした後)
    @param lookup 同じ時点のファイル
    """
    siblings = lookup.siblings.get(posixpath.dirname(source), {})
    found = set()
    for match in PathToken.finditer(text):
        token = match.group(0)
        after_subshell = token.startswith("/") and match.start() > 0 and text[match.start() - 1] == ")"
        variable_relative = VariablePrefix.sub("", token)
        candidates = {token, referenced_path(source, token, after_subshell), variable_relative}
        found.update(candidates & lookup.paths)
        if token in siblings:
            found.add(siblings[token])
    return found


def used_paths(source: str, content: str, lookup: PathLookup) -> set[str]:
    """1 つのファイルが使っているファイルを、2 通りの拾い方(Python import と明示パス)を合わせて返す。

    @param source 使う側のパス
    @param content その中身(`source_text` の戻り値)
    @param lookup 同じ時点のファイル
    """
    if source.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs")):
        code, literals = lexical_parts(content)
        imported = set()
        for start, (value, _) in literals.items():
            if not value.startswith("."):
                continue
            if not re.search(r"(?:\bfrom|\bimport|\bimport\s*\()\s*$", code[:start]):
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(source), value))
            stems = {target}
            if target.endswith(".js"):
                stems.add(target[:-3])
            candidates = {stem + suffix for stem in stems for suffix in ("", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js")}
            found = candidates & lookup.paths
            if len(found) == 1:
                imported.update(found)
        return imported
    text = code_of(source, content)
    imported_python = python_imported_paths(text, lookup) if source.endswith(".py") else set()
    return imported_python | mentioned_paths(source, text, lookup)


def edges_in(snapshot: dict[str, str | None]) -> set[tuple[str, str]]:
    """ある時点の、使う側 → 使われる側の組をすべて返す(自分自身への組は除く)。

    @param snapshot パス → 依存を探しに読む中身(`snapshots_at` の戻り値の片方)
    """
    lookup = lookup_of(frozenset(snapshot))
    edges = set()
    for source, content in snapshot.items():
        if content is None:
            continue
        edges.update((source, used) for used in used_paths(source, content, lookup) if used != source)
    return edges


def edges_touching(edges: set[tuple[str, str]], paths: set[str]) -> set[tuple[str, str]]:
    """端の少なくとも一方が `paths` に入る組だけを返す。"""
    return {edge for edge in edges if edge[0] in paths or edge[1] in paths}


def dependencies_between(files: list[dict], before: dict[str, str | None], after: dict[str, str | None]) -> list[dict]:
    """端の少なくとも一方が変更ファイルの依存を、merge-base から head への変化とともに返す。

    @param files 変更ファイル(`changed_files` の戻り値)
    @param before merge-base のすべてのファイル(`snapshots_at` の戻り値)
    @param after head のすべてのファイル
    @returns `{"from": 使う側, "to": 使われる側, "status": 変化}` の並び。変化は head にだけあれば `added`、両方に
        あれば `kept`、merge-base にだけあれば `removed`。merge-base 側の端は、rename の新しいパスに付け替えてから比べる
    """
    renamed = {file["oldPath"]: file["path"] for file in files if file["oldPath"]}
    changed_after = {file["path"] for file in files}
    changed_before = {file["oldPath"] or file["path"] for file in files}
    edges_after = edges_touching(edges_in(after), changed_after)
    edges_before = {
        (renamed.get(source, source), renamed.get(used, used))
        for source, used in edges_touching(edges_in(before), changed_before)
    }
    removed = {edge: "removed" for edge in edges_before - edges_after}
    added = {edge: "added" for edge in edges_after - edges_before}
    kept = {edge: "kept" for edge in edges_after & edges_before}
    statuses = removed | added | kept
    return [{"from": source, "to": used, "status": statuses[(source, used)]} for source, used in sorted(statuses)]


def hunk_lines(diff: str) -> list[str]:
    """`git diff` の出力から、最初の hunk の見出し(`@@`)から後の行を返す。hunk が無ければ空。"""
    lines = diff.removesuffix("\n").split("\n")
    start = next((index for index, line in enumerate(lines) if line.startswith("@@")), len(lines))
    return lines[start:]


def patch_of(sha: str, file: dict) -> dict:
    """コミットでの 1 ファイルの差分を返す。

    @param sha コミット(親が 1 つ)
    @param file そのコミットの変更ファイル(`changed_files` の要素)
    @returns `patch`(最初の `@@` から `MaxPatchLines` 行まで。hunk が無ければ空文字。消したファイルとバイナリは
        None)・`patchLines`(切る前の行数。patch が None なら 0)・`truncated`(切ったか)。埋め込みを読む拡張子
        (`has_embedding_rules`)で patch が None でなければ、`hunkOpeningLines`(`hunk_opening_lines`)も持つ
    """
    has_no_patch = file["status"] == "D" or file["additions"] is None
    if has_no_patch:
        return {"patch": None, "patchLines": 0, "truncated": False}
    paths = (file["oldPath"], file["path"]) if file["oldPath"] else (file["path"],)
    diff = git("--literal-pathspecs", "diff", "-M", "--no-color", "--no-ext-diff", f"{sha}^", sha, "--", *paths)
    lines = hunk_lines(diff)
    shown = {"patch": "\n".join(lines[:MaxPatchLines]), "patchLines": len(lines), "truncated": len(lines) > MaxPatchLines}
    if not has_embedding_rules(file["path"]):
        return shown
    return {**shown, "hunkOpeningLines": hunk_opening_lines(sha, file, lines[:MaxPatchLines])}


# ページの `CommitDiff` の `HunkHeader` と同じ読み方(食い違ったときの扱いはそちら)。
HunkHeader = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def hunk_opening_lines(sha: str, file: dict, lines: list[str]) -> list[dict]:
    """hunk ごとに、変更前と変更後の始まりの行の頭で効いている埋め込みを開いた行を返す。

    変更前は親の旧パス(rename でなければ同じパス)、変更後はそのコミットのパスの中身から読み、どちらも変更後のパスの
    拡張子で `opening_lines` に通す。

    @param lines 切った後の patch の行
    @returns patch の `@@` の順に `{"old", "new"}`。中身が無い側(足したファイルの変更前など)・範囲の外(`-0,0` など)は None
    """
    names = [f"{sha}^:{file['oldPath'] or file['path']}", f"{sha}:{file['path']}"]

    # 変更前も変更後のパスの拡張子で読む。ページが変更前の行も、変更後のパスの文法で色分けするため。
    def openings_in(content: bytes | None) -> list[str | None] | None:
        return None if content is None else opening_lines(file["path"], content.decode("utf-8", errors="replace").split("\n"))

    old_content, new_content = read_objects(names)
    old, new = openings_in(old_content), openings_in(new_content)

    def at(openings: list[str | None] | None, number: int) -> str | None:
        is_in_file = openings is not None and 1 <= number <= len(openings)
        return openings[number - 1] if is_in_file else None

    starts = [match for match in map(HunkHeader.match, lines) if match]
    return [{"old": at(old, int(match[1])), "new": at(new, int(match[2]))} for match in starts]


def commit_files(sha: str) -> list[dict]:
    """親が 1 つのコミットで変わったファイルを、差分とともにパスの順で返す。"""
    files = changed_files(f"{sha}^", sha)
    return sorted(({**file, **patch_of(sha, file)} for file in files), key=lambda file: file["path"])


def commit_of(record: list[str]) -> dict:
    """`git log` の 1 コミット分の欄(`CommitFields` の順)から、地図のコミットを作る。"""
    sha, parents, author, date, subject, body = record
    merge = len(parents.split()) > 1
    files = [] if merge else commit_files(sha)
    return {"sha": sha, "merge": merge, "author": author, "date": date, "subject": subject, "body": body.rstrip("\n"), "files": files}


def commits_between(base: str, head: str) -> list[dict]:
    """base..head のコミットを、親を子より前に置いたうえで古い順に返す。

    @returns コミットごとに sha・マージか(親が 2 つ以上)・作者・作者の日時(ISO 8601)・件名・本文・変更ファイル。
        マージコミットは変更ファイルを持たない
    """
    fields = git("log", "-z", "--date-order", "--reverse", f"--format={CommitFormat}", f"{base}..{head}").split("\0")
    size = len(CommitFields)
    return [commit_of(fields[start : start + size]) for start in range(0, len(fields) - size + 1, size)]


def build_map(pr: PullRequest) -> dict:
    """change-map.json の中身を作る。

    @param pr 地図を作る PR
    @returns 地図。`mergeBase` は base の先端ではなく head との分岐点。変更が無ければ各一覧は空配列
    """
    head = git("rev-parse", pr.head).strip()
    merge_base = git("merge-base", pr.base, head).strip()
    files = changed_files(merge_base, head)
    before, after = snapshots_at(merge_base, head)
    dependencies = dependencies_between(files, before, after)
    return {
        "version": 2,
        "pr": pr.number,
        "headBranch": pr.head_branch,
        "baseBranch": pr.base_branch,
        "mergeBase": merge_base,
        "head": head,
        "groups": group_files(listed_files(files, dependencies, frozenset(after))),
        "tests": test_changes(files, before, after),
        "commits": commits_between(merge_base, head),
        "dependencies": dependencies,
    }


def main(argv: list[str]) -> int:
    args = dict(zip(argv[1::2], argv[2::2]))
    complete = len(argv) == 1 + 2 * len(Options) and set(args) == set(Options) and re.fullmatch(r"[1-9][0-9]*", args["--pr"]) is not None
    if not complete:
        print("使い方: build-pr-change-map.py --base <sha> --head <sha> --pr <番号> --head-branch <名前> --base-branch <名前>", file=sys.stderr)
        return 2
    pr = PullRequest(int(args["--pr"]), args["--base"], args["--head"], args["--base-branch"], args["--head-branch"])
    try:
        change_map = build_map(pr)
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else error.stderr
        print(f"git が失敗しました: {' '.join(error.cmd)}\n{stderr}", file=sys.stderr)
        return 1
    except UnreadableBlobError as error:
        print(f"地図を作れません: {error}", file=sys.stderr)
        return 1
    json.dump(change_map, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
