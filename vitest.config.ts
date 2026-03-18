import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "packages/core",
          environment: "node",
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
