import { db } from "@/lib/db";
import { locked } from "@/lib/storage";
import {
  diagramTreeSchema,
  reconcileTree,
  validateTree,
  type DiagramTree,
} from "@/lib/diagram-tree";
type Context = { params: Promise<{ id: string }> };
async function read(id: string): Promise<DiagramTree> {
  const setting = await db.setting.findUnique({
    where: { key: "diagram-tree:" + id },
  });
  return setting
    ? diagramTreeSchema.parse(JSON.parse(setting.value))
    : { revision: 0, entries: [] };
}
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await db.project.findUnique({
    where: { id },
    include: { diagrams: { orderBy: { updatedAt: "asc" } } },
  });
  if (!project)
    return Response.json({ error: "Project not found." }, { status: 404 });
  const tree = await read(id);
  return Response.json({
    ...tree,
    entries: reconcileTree(tree.entries, project.diagrams),
  });
}
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = diagramTreeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid diagram tree." }, { status: 400 });
  return locked("diagram-tree:" + id, async () => {
    const project = await db.project.findUnique({
      where: { id },
      include: { diagrams: true },
    });
    if (!project)
      return Response.json({ error: "Project not found." }, { status: 404 });
    const old = await read(id);
    if (old.revision !== parsed.data.revision)
      return Response.json(
        {
          error:
            "The diagram tree changed in another tab. Reload it before trying again.",
        },
        { status: 409 },
      );
    try {
      validateTree(
        parsed.data.entries,
        new Set(project.diagrams.map((d) => d.id)),
      );
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const tree = {
      revision: old.revision + 1,
      entries: reconcileTree(parsed.data.entries, project.diagrams),
    };
    await db.setting.upsert({
      where: { key: "diagram-tree:" + id },
      create: { key: "diagram-tree:" + id, value: JSON.stringify(tree) },
      update: { value: JSON.stringify(tree) },
    });
    return Response.json(tree);
  });
}
