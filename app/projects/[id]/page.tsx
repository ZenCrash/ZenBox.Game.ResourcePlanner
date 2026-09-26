import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: { diagrams: { orderBy: { updatedAt: "asc" } } },
  });
  if (!project) notFound();
  return <Workspace project={JSON.parse(JSON.stringify(project))} />;
}
