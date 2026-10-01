import { fuelValues } from "@/lib/fuel-values";
import { isGtnhInstalled } from "@/lib/game-packs";
import { z } from "zod";
export async function POST(request: Request) {
  if (!isGtnhInstalled()) return Response.json({ error: "Install the GTNH game pack first." }, { status: 409 });
  const parsed = z.array(z.string().min(1).max(500)).max(500).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid item list." }, { status: 400 });
  return Response.json(await fuelValues([...new Set(parsed.data)]));
}
