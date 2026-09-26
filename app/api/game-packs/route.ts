import { isGtnhInstalled } from "@/lib/game-packs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({
    gtnh: { installed: isGtnhInstalled(), version: "2.8.4" },
    vanilla: { installed: false, comingSoon: true },
  });
}
