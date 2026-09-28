import { readFile, stat } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const parts = (await context.params).path;
  if (
    parts.some(
      (part) =>
        !/^[a-zA-Z0-9_.-]+$/.test(part) || part === "." || part === "..",
    ) ||
    !parts.at(-1)?.endsWith(".png")
  )
    return new Response(null, { status: 404 });
  const root = path.resolve(/* turbopackIgnore: true */ "data/game-assets");
  const file = path.resolve(/* turbopackIgnore: true */ root, ...parts);
  if (!file.startsWith(root + path.sep))
    return new Response(null, { status: 404 });
  try {
    const info = await stat(/* turbopackIgnore: true */ file);
    const etag = `"${info.size}-${Math.floor(info.mtimeMs)}"`;
    const cacheControl = "public, max-age=300, must-revalidate";
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
    return new Response(
      new Uint8Array(await readFile(/* turbopackIgnore: true */ file)),
      {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": cacheControl,
          ETag: etag,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
