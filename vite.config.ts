// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const require = createRequire(import.meta.url);

/** htmlparser2 imports entities 7 subpaths. The entities 4 pin must not swallow them. */
function entitiesSubpath(subpath: "decode" | "escape") {
  try {
    return require.resolve(`entities/${subpath}`, {
      paths: [path.resolve(import.meta.dirname, "node_modules/htmlparser2")],
    });
  } catch {
    return path.resolve(import.meta.dirname, "node_modules/entities/lib", `${subpath}.js`);
  }
}

// Server-side code (email routes) needs non-VITE_ env vars in process.env.
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    resolve: {
      alias: {
        "entities/decode": entitiesSubpath("decode"),
        "entities/escape": entitiesSubpath("escape"),
        "entities/lib/decode.js": path.resolve(
          import.meta.dirname,
          "node_modules/entities/lib/decode.js",
        ),
        "entities/lib/encode.js": path.resolve(
          import.meta.dirname,
          "node_modules/entities/lib/encode.js",
        ),
        entities: path.resolve(import.meta.dirname, "node_modules/entities"),
        // Pin tslib to its ESM build; the CJS build crashes the server bundle at boot.
        tslib: path.resolve(import.meta.dirname, "node_modules/tslib/tslib.es6.mjs"),
      },
    },
  },
});
