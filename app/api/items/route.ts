import { isGtnhInstalled } from "@/lib/game-packs";
import { catalog } from "@/lib/db";
export async function GET(request: Request) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, 500);
  return Response.json(
    await catalog.item.findMany({ where: { id: { in: ids } } }),
  );
}
