import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";

export function RecipeChevron({
  direction,
}: {
  direction: "left" | "right" | "up" | "down";
}) {
  const Icon = {
    left: ChevronLeft,
    right: ChevronRight,
    up: ChevronUp,
    down: ChevronDown,
  }[direction];
  return <Icon className="recipe-chevron" size={17} aria-hidden="true" />;
}
