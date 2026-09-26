import { createReadStream } from "node:fs";
import { mkdir, open, unlink, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  exportPack,
  installPack,
  isGtnhInstalled,
  MAX_PACK_BYTES,
} from "@/lib/game-packs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (isGtnhInstalled())
    return Response.json(
      { error: "GTNH is already installed." },
      { status: 409 },
    );
  if (!request.body)
    return Response.json({ error: "Choose a game-pack ZIP." }, { status: 400 });
  if (Number(request.headers.get("content-length")) > MAX_PACK_BYTES)
    return Response.json({ error: "The ZIP exceeds 1 GiB." }, { status: 413 });
  const directory = path.resolve("data/game-packs/uploads");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${randomUUID()}.zip`);
  try {
    const handle = await open(file, "wx");
    const reader = request.body.getReader();
    try {
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_PACK_BYTES) {
          await reader.cancel();
          throw new Error("The ZIP exceeds 1 GiB.");
        }
        await handle.writeFile(value);
      }
    } finally {
      await handle.close();
      reader.releaseLock();
    }
    await installPack(file);
    return Response.json({ installed: true }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not install game pack.",
      },
      { status: 400 },
    );
  } finally {
    await unlink(file).catch(() => {});
  }
}
export async function GET() {
  if (!isGtnhInstalled())
    return Response.json({ error: "GTNH is not installed." }, { status: 404 });
  try {
    const file = await exportPack();
    return new Response(
      Readable.toWeb(createReadStream(file)) as ReadableStream,
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String((await stat(file)).size),
          "Content-Disposition":
            'attachment; filename="gtnh-2.8.4.gamepack.zip"',
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Could not build the game-pack ZIP. Check available disk space and try again.",
      },
      { status: 500 },
    );
  }
}
