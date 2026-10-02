import { catalog } from '@/lib/db';
import { isGtnhInstalled } from '@/lib/game-packs';
export async function GET(request: Request) {
  if (!isGtnhInstalled()) return Response.json({}, { status: 409 });
  const id = new URL(request.url).searchParams.get('itemId');
  if (!id || id.length > 512) return Response.json({}, { status: 400 });
  try {
    const rows = await catalog.$queryRawUnsafe<{ variants: string }[]>('SELECT variants FROM ItemTooltipVariant WHERE itemId = ? LIMIT 1', id);
    return Response.json(rows[0] ? JSON.parse(rows[0].variants) : {});
  } catch (error) {
    // Older portable game packs do not contain extended tooltips yet.
    if (String(error).includes('no such table')) return Response.json({});
    throw error;
  }
}
