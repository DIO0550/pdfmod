#!/usr/bin/env bash
#
# 判定表（`*-cases.sh`）が共有する、判定の読み取りと報告。
#
# 使い方: source したうえで `decide`・`normalize_miss`・`all_in_category`・`report` を呼び、最後に
# `cases_failed` を見る。ケースの並べ方と検出器の呼び方は、判定表ごとに違う（走査ルートを
# 絶対パスで渡すもの・`cd` してから相対で渡すもの、置くのが 1 ファイルか木か）ので、
# そこは各判定表が持つ。
#
# **共有先を作ったのは、`.claude/hooks/lib/` の中に同じ関数が 2 本並んだため**（いまは 8 本）
# （`rules/coding.md`「同じ処理が2箇所に現れたら共通化する」）。`harness/records/count-cases.sh`
# が共通化を見送っているのは、判定表が 4 つのフォルダに割れていて共有先を置くと判定表 1 本を
# 単体で読めなくなるからで、同じフォルダに並ぶこれらにはその理由が当たらない。
#
# 判定を終了コードで見る理由は `.claude/hooks/README.md`「終了コードまで見る」。

# 食い違ったケースがあれば 1 になる。source した側が最後に見る。
cases_failed=0

# 検出器の出力と終了コードから、deny / pass / broken を決める。
#
# $1 検出器の標準出力
# $2 検出器の終了コード
# $3 報告の見出しの正規表現（`grep -E` に渡す）
decide() {
  local output="$1" status="$2" heading="$3"
  if [ "$status" -ne 1 ]; then
    echo "pass"
    return 0
  fi
  # exit 1 は違反あり。報告の見出しが無いなら判定が壊れている。
  if printf '%s' "$output" | grep -qE "$heading"; then
    echo "deny"
  else
    echo "broken"
  fi
}

# 報告が 1 行以上あり、すべての行が期待した見出しで始まるか。違反を分類で報告する検出器の、落とす側の
# ケースに使う。崩したのと別の規則で落ちても終了コードは同じ 1 なので、分類まで見ないと、崩した規則を
# 消しても ok のまま残る。
#
# $1 検出器の報告
# $2 報告の見出しの正規表現（`grep -E` に渡す。行頭から当てる）
all_in_category() {
  local output="$1" heading="$2"
  [ -n "$output" ] || return 1
  ! printf '%s\n' "$output" | grep -vE "$heading" >/dev/null
}

# 意図した取りこぼしは pass になるのが正解なので、表の綴りへ戻す。
#
# $1 表に書かれた期待
# $2 `decide` が返した判定
normalize_miss() {
  local expected="$1" decision="$2"
  if [ "$expected" = "miss" ] && [ "$decision" = "pass" ]; then
    echo "miss"
    return 0
  fi
  echo "$decision"
}

# 1 ケースの結果を 1 行で出す。食い違ったら `cases_failed` を立てる。
#
# $1 表に書かれた期待
# $2 実際の判定
# $3 ケース名
report() {
  local expected="$1" decision="$2" label="$3"
  if [ "$decision" = "$expected" ]; then
    printf 'ok   %-4s %s\n' "$expected" "$label"
    return 0
  fi
  printf 'NG   expected=%s got=%s  %s\n' "$expected" "$decision" "$label"
  cases_failed=1
}
