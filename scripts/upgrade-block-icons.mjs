import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import sharp from "sharp";

const game = path.resolve("data/extraction/instance/minecraft");
const request = path.join(game, "planner-export.block-images.json");
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite", { readonly: true });
try {
  if (process.argv.includes("--prepare")) {
    const rows = db
      .prepare(
        "SELECT id, registryId, metadata, nbt FROM Item WHERE kind = 'item' AND image IS NOT NULL",
      )
      .all();
    const representative = new Map();
    for (const row of rows)
      if (row.metadata !== 32767 && !row.nbt)
        representative.set(
          row.registryId,
          Math.min(
            representative.get(row.registryId) ?? Infinity,
            row.metadata,
          ),
        );
    const requests = rows.flatMap((row) => {
      const metadata =
        row.metadata === 32767
          ? representative.get(row.registryId)
          : row.metadata;
      return metadata === undefined
        ? []
        : [{ ...row, representativeMetadata: metadata }];
    });
    fs.writeFileSync(request, JSON.stringify(requests));
    console.log(
      `Prepared ${requests.length} candidates; the game exporter filters actual ItemBlock instances.`,
    );
  } else if (process.argv.includes("--install")) {
    const statusPath = path.join(game, "dumps/planner/status.txt");
    const manifestPath = path.join(game, "dumps/planner/block-icons.json");
    if (
      !fs
        .readFileSync(statusPath, "utf8")
        .includes("finished; validation required") ||
      fs.statSync(manifestPath).mtimeMs < fs.statSync(request).mtimeMs
    )
      throw new Error(
        "Wait for the current block export to finish before installing.",
      );
    const icons = JSON.parse(
      fs.readFileSync(
        path.join(game, "dumps/planner/block-icons.json"),
        "utf8",
      ),
    );
    const backup = path.resolve("data/block-icon-backup");
    fs.mkdirSync(backup, { recursive: true });
    const item = db.prepare(
      "SELECT image FROM Item WHERE id = ? AND kind = 'item'",
    );
    const records = [];
    const rejected = [];
    const installed = new Set();
    let cursor = 0;
    const install = async ([id, filename, size]) => {
      if (path.basename(filename) !== filename || size !== 256)
        throw new Error(`Invalid block export: ${id}`);
      const row = item.get(id);
      if (!row?.image?.startsWith("/assets/gtnh-2.8.4/items/")) return;
      const destination = path.resolve("data/game-assets", row.image.replace(/^\/assets\//, ""));
      if (
        path.dirname(destination) !==
        path.resolve("data/game-assets/gtnh-2.8.4/items")
      )
        throw new Error("Invalid image destination");
      if (installed.has(destination)) return;
      installed.add(destination);
      const source = path.join(game, "dumps/block-icons", filename);
      const png = fs.readFileSync(source);
      const { data: pixels, info: meta } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let visible = false;
      for (let i = meta.channels - 1; i < pixels.length; i += meta.channels)
        if (pixels[i] > 0) {
          visible = true;
          break;
        }
      if (meta.width !== 256 || meta.height !== 256 || !visible) {
        rejected.push(id);
        return;
      }
      const backupPath = path.join(backup, path.basename(destination));
      const previous = fs.readFileSync(
        fs.existsSync(backupPath) ? backupPath : destination,
      );
      if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, previous);
      for (let attempt = 0; ; attempt++) {
        try {
          fs.writeFileSync(destination, png);
          break;
        } catch (error) {
          if (attempt >= 7) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      installed.add(destination);
      records.push({
        id,
        image: row.image,
        previousSha256: createHash("sha256").update(previous).digest("hex"),
        sha256: createHash("sha256")
          .update(fs.readFileSync(source))
          .digest("hex"),
      });
      if (records.length % 1000 === 0)
        console.log(
          `Installed ${records.length} / ${icons.length} block icons`,
        );
    };
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < icons.length) await install(icons[cursor++]);
      }),
    );
    records.sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(
      path.join(backup, "installed.json"),
      JSON.stringify({ resolution: 256, records, rejected }, null, 2),
    );
    fs.renameSync(request, request + ".completed");
    console.log(
      JSON.stringify({ installed: records.length, rejected, backup }),
    );
  } else throw new Error("Use --prepare or --install");
} finally {
  db.close();
}
