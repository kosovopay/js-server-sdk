/**
 * Post-build: rewrite relative `.ts` import specifiers in emitted `.d.ts` files
 * to `.js`.
 *
 * `tsc`'s `rewriteRelativeImportExtensions` rewrites extensions in the emitted
 * JavaScript but leaves declaration files pointing at `.ts`, which downstream
 * TypeScript consumers reject. This brings the declarations in line with the JS.
 */
import { Glob } from "bun";

const glob = new Glob("dist/**/*.d.ts");
const specifier = /(from\s+["'])(\.[^"']*?)\.ts(["'])/g;

let patched = 0;
for await (const path of glob.scan(".")) {
  const file = Bun.file(path);
  const before = await file.text();
  const after = before.replace(specifier, "$1$2.js$3");
  if (after !== before) {
    await Bun.write(path, after);
    patched++;
  }
}

console.log(`fix-dts: rewrote .ts → .js specifiers in ${patched} declaration file(s)`);
