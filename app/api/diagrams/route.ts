import { isGtnhInstalled } from "@/lib/game-packs";
import { db } from "@/lib/db";
import { blankDiagram } from "@/lib/model";
import { writeDiagram } from "@/lib/storage";
import { z } from "zod";
export async function POST(request: Request) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const result = z
    .object({
      projectId: z.string().uuid(),
      name: z.string().trim().min(1).max(100),
    })
    .safeParse(await request.json().catch(() => null));
  if (!result.success)
    return Response.json({ error: "Invalid diagram name." }, { status: 400 });
  if (!(await db.project.findUnique({ where: { id: result.data.projectId } })))
    return Response.json({ error: "Project not found" }, { status: 404 });
  const diagram = await db.diagram.create({ data: result.data });
  try {
    await writeDiagram(diagram.id, blankDiagram());
  } catch (error) {
    await db.diagram.delete({ where: { id: diagram.id } });
    throw error;
  }
  return Response.json(diagram, { status: 201 });
}
