import { isGtnhInstalled } from "@/lib/game-packs";
import { catalog, db } from "@/lib/db";
import { hydrateFluidContents } from "@/lib/fluid-containers";
import {
  diagramSchema,
  resolveDiagramVariants,
  itemSourceRecipe,
} from "@/lib/model";
import { locked, readDiagram, writeDiagram } from "@/lib/storage";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const { id } = await context.params;
  if (!(await db.diagram.findUnique({ where: { id } })))
    return Response.json({ error: "Diagram not found" }, { status: 404 });
  return Response.json(await readDiagram(id));
}
export async function PUT(request: Request, context: Context) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const { id } = await context.params;
  const parsed = diagramSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid diagram document" },
      { status: 400 },
    );
  return locked(id, async () => {
    const record = await db.diagram.findUnique({ where: { id } });
    if (!record)
      return Response.json({ error: "Diagram not found" }, { status: 404 });
    const old = await readDiagram(id);
    let document = parsed.data;
    if (old.revision !== document.revision)
      return Response.json(
        { error: "This diagram changed in another tab. Reload before saving." },
        { status: 409 },
      );
    const recipes = await catalog.recipe.findMany({
      where: {
        id: {
          in: document.nodes.filter((n) => !n.itemId).map((n) => n.recipeId),
        },
        enabled: true,
      },
      include: { ingredients: { include: { item: true } } },
    });
    const items = await catalog.item.findMany({
      where: {
        id: { in: document.nodes.flatMap((n) => (n.itemId ? [n.itemId] : [])) },
      },
    });
    const allRecipes = [...recipes, ...items.map(itemSourceRecipe)];
    const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
    const nodeMap = new Map(document.nodes.map((n) => [n.id, n]));
    if (
      nodeMap.size !== document.nodes.length ||
      new Set(document.edges.map((e) => e.id)).size !== document.edges.length ||
      document.nodes.some((n) => !recipeMap.has(n.recipeId))
    )
      return Response.json(
        { error: "Unknown recipe or duplicate ID" },
        { status: 400 },
      );
    try {
      document = resolveDiagramVariants(document, document.edges.some((edge) => edge.reference)
        ? await hydrateFluidContents(allRecipes) : allRecipes);
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    document.revision++;
    await writeDiagram(id, document);
    await db.project.update({
      where: { id: record.projectId },
      data: { updatedAt: new Date() },
    });
    return Response.json({ revision: document.revision });
  });
}
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return locked(id, async () => {
    await db.diagram.deleteMany({ where: { id } });
    return Response.json({ ok: true });
  });
}
