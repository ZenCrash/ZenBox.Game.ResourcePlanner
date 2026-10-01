import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { packPaths } from "./game-packs";

// Bump when recipe hydration changes, even if the installed database does not.
const hydrationVersion = "diagram-catalog-1";
export function catalogRevision() {
  const paths = packPaths();
  const stamps = [paths.database, `${paths.database}-wal`, paths.marker].map(file => {
    try { const stat = statSync(/* turbopackIgnore: true */ file); return [stat.size, stat.mtimeMs, stat.ctimeMs]; }
    catch { return null; }
  });
  return createHash("sha256").update(JSON.stringify([hydrationVersion, stamps])).digest("hex");
}
