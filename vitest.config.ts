import { defineConfig } from "vitest/config";

// Unit tests execute handlers directly, without Start's RPC build transform.
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node" },
});