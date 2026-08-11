import { coverageConfigDefaults, defineConfig } from "vitest/config";

// CLI の `--typecheck.only` は inline projects に伝播しないため、環境変数で切り替える。
// `pnpm test:types` だけが型テストを実行し、通常の `pnpm test:run` では走らない。
const typecheckOnly = process.env.VITEST_TYPECHECK === "1";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "packages/core",
          environment: "node",
          typecheck: {
            enabled: typecheckOnly,
            only: typecheckOnly,
            include: ["src/**/*.test-d.ts"],
            tsconfig: "./tsconfig.json",
          },
        },
      },
      {
        test: {
          name: "react",
          root: "packages/react",
          environment: "jsdom",
          setupFiles: [],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        "**/dist/**",
        "**/stories/**",
        "**/*.stories.{ts,tsx}",
      ],
    },
  },
});
