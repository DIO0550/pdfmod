import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
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
]);
