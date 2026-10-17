import assert from "node:assert/strict";
import { test } from "node:test";

// Proves Node runs the core's TypeScript through the workspace link (type stripping refuses node_modules paths).
test("@yogo75/core loads from the CLI", async () => {
  assert.equal(typeof (await import("@yogo75/core")), "object");
});
