#!/usr/bin/env bash
# 相対モジュール指定子に .js/.ts/.tsx 拡張子が含まれていたらエラー
# 対象: from "...", import "...", import("...") の全パターン
set -euo pipefail

result=$(grep -rn --include="*.ts" --include="*.tsx" \
  -E "(from\s+|import\s+|import\(\s*)[\"']\.[^\"']*\.(js|ts|tsx)[\"']" \
  packages/*/src packages/*/stories 2>&1) || rc=$?

rc=${rc:-0}

if [ "$rc" -eq 0 ]; then
  echo "ERROR: Found import statements with file extensions:"
  echo "$result"
  exit 1
elif [ "$rc" -eq 1 ]; then
  exit 0
else
  echo "ERROR: grep failed unexpectedly"
  echo "$result"
  exit "$rc"
fi
