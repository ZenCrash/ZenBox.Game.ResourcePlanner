import { isGtnhInstalled } from "@/lib/game-packs";
import { db } from "@/lib/db";
import { blankDiagram } from "@/lib/model";
import { writeDiagram } from "@/lib/storage";
import { z } from "zod";
export async function GET() {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  return Response.json(
    await db.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: { diagrams: { orderBy: { updatedAt: "desc" } } },
    }),
  );
}
export async function POST(request: Request) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const result = z
    .object({
      name: z.string().trim().min(1).max(100),
      version: z.literal("2.8.4"),
    })
    .safeParse(await request.json().catch(() => null));
  if (!result.success)
    return Response.json(
      { error: "Enter a project name and select version 2.8.4." },
      { status: 400 },
    );
  const project = await db.project.create({
    data: { ...result.data, diagrams: { create: { name: "Main production" } } },
    include: { diagrams: true },
  });
  try {
    await writeDiagram(project.diagrams[0].id, blankDiagram());
  } catch (error) {
    await db.project.delete({ where: { id: project.id } });
    throw error;
  }
  return Response.json(project, { status: 201 });
}
