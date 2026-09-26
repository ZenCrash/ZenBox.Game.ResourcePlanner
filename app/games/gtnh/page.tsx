import { isGtnhInstalled } from "@/lib/game-packs";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
import { ProjectList } from "@/components/project-list";
export default function Page() {
  if (!isGtnhInstalled()) redirect("/games/minecraft");
  return <ProjectList />;
}
