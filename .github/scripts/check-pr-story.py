#!/usr/bin/env python3
"""変更の経緯の説明漏れと、差分に結び付かない行注釈を公開前に検出する。"""

import argparse
import json
from pathlib import Path
import re


HUNK = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")
MAX_NOTE_LINES = 80


def changed_hunks(patch: str) -> list[dict]:
    """表示用patchから、hunkごとの変更行と文脈行の番号を両側について返す。"""
    hunks = []
    old = new = 0
    for raw in patch.splitlines():
        header = HUNK.match(raw)
        if header:
            old, new = map(int, header.groups())
            hunks.append({"header": raw, "old": set(), "new": set(), "oldLines": set(), "newLines": set()})
            continue
        if not hunks or not raw or raw[0] not in " +-":
            continue
        sign = raw[0]
        if sign != "+":
            hunks[-1]["oldLines"].add(old)
        if sign != "-":
            hunks[-1]["newLines"].add(new)
        if sign in "+-":
            hunks[-1]["new" if sign == "+" else "old"].add(new if sign == "+" else old)
        old += sign != "+"
        new += sign != "-"
    return hunks


def intersects(note: dict, hunk: dict) -> bool:
    return any(note["start"] <= line <= note["end"] for line in hunk[note.get("side", "new")])


def placed_hunk(note: dict, hunks: list[dict]) -> dict | None:
    """ビューアと同じく、文脈行も含めて最初に重なるhunkへ注釈を置く。"""
    side = note.get("side", "new") + "Lines"
    return next((hunk for hunk in hunks if any(note["start"] <= line <= note["end"] for line in hunk[side])), None)


def note_errors(note: dict, file: dict, hunks: list[dict]) -> list[str]:
    """行注釈の範囲・本文・表示される変更行との対応を検査する。"""
    start, end = note.get("start"), note.get("end")
    if type(start) is not int or type(end) is not int or start < 1 or end < start:
        return ["注釈のstart/endは1始まりの順序付けた整数にする"]
    if end - start + 1 > MAX_NOTE_LINES:
        return [f"注釈は処理単位に分け、範囲を{MAX_NOTE_LINES}行以内にする"]
    if not isinstance(note.get("text"), str) or not note["text"].strip():
        return ["注釈の本文が空白です。処理の変更内容と理由を書く"]
    if note.get("side", "new") not in ("old", "new"):
        return ["注釈のsideはoldまたはnewにする"]
    if file.get("status") == "D":
        lines = file.get("deletions")
        outside = isinstance(lines, int) and end > lines
        if note.get("side", "new") != "old" or outside:
            return ["削除ファイルの注釈は変更前の存在する行へside: oldで付ける"]
        return []
    # バイナリ・内容不変のrenameは行差分がない。本文と範囲は検査し、ファイルの説明として残す。
    if file.get("patch") in (None, ""):
        return []
    placement = placed_hunk(note, hunks)
    if placement is None or not intersects(note, placement):
        return ["注釈が表示差分の変更行に重なっていません。対象のsideと行番号を確認する"]
    return []


def commit_errors(commit: dict, story: dict | None) -> list[str]:
    """コミットの意図、各ファイルの注釈、表示される各hunkの説明を確認する。"""
    if story is None:
        return ["commitStoriesにこのコミットの処理ごとの解説がありません"]
    errors = [f"commitStories.{key}が空白です" for key in ("role", "why") if not isinstance(story.get(key), str) or not story[key].strip()]
    files = {file["path"]: file for file in commit["files"]}
    notes = story.get("notes", [])
    if not isinstance(notes, list) or any(not isinstance(note, dict) for note in notes):
        return errors + ["commitStories.notesは注釈の配列にする"]
    errors += [f"{note.get('path')}: このコミットにないファイルへの注釈です" for note in notes if note.get("path") not in files]
    for path, file in files.items():
        own_notes = [note for note in notes if note.get("path") == path]
        hunks = changed_hunks(file.get("patch") or "")
        valid = []
        for note in own_notes:
            violations = note_errors(note, file, hunks)
            errors += [f"{path}: {error}" for error in violations]
            if not violations:
                valid.append(note)
        if not valid:
            errors.append(f"{path}: このファイルの変更を説明する注釈がありません")
        for hunk in hunks:
            if (hunk["old"] or hunk["new"]) and not any(placed_hunk(note, hunks) is hunk for note in valid):
                errors.append(f"{path} {hunk['header']}: 変更行に対応する注釈がありません")
    return errors


def collect_errors(explain: dict, change_map: dict) -> list[str]:
    """古い解説はそのSHAまでを検査し、後から追加されたコミットには説明を要求しない。"""
    if explain.get("pr") != change_map.get("pr"):
        return ["解説と地図のPR番号が一致しません"]
    commits = change_map.get("commits")
    if not isinstance(commits, list):
        return ["地図にcommitsの配列がありません。変更の地図を生成し直す"]
    shas = [commit["sha"] for commit in commits]
    sha = explain.get("sha")
    if sha not in shas:
        if not commits and sha == change_map.get("head") == change_map.get("mergeBase"):
            return []
        return ["解説のshaが地図のコミットにありません。解説と地図の時点を確認する"]
    stories = explain.get("commitStories", [])
    if not isinstance(stories, list):
        return ["commitStoriesはコミット解説の配列にする"]
    by_sha = {story["sha"]: story for story in stories}
    errors = []
    for commit in commits[:shas.index(sha) + 1]:
        if not commit.get("merge", False):
            errors += [f"{commit['sha'][:7]}: {error}" for error in commit_errors(commit, by_sha.get(commit["sha"]))]
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("explain", type=Path)
    parser.add_argument("change_map", type=Path)
    args = parser.parse_args()
    try:
        explain = json.loads(args.explain.read_text(encoding="utf-8"))
        change_map = json.loads(args.change_map.read_text(encoding="utf-8"))
        errors = collect_errors(explain, change_map)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        errors = [f"解説または地図の形式を確認する: {error}"]
    for error in errors:
        print(f"[pr-explain-story] {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
