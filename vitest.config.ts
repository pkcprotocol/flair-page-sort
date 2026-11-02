import { defineConfig } from "vitest/config";

// Unit tests only: the scorer is a pure function of what pkc-js hands it, and the data file is read from a temp dir.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"]
  }
});
