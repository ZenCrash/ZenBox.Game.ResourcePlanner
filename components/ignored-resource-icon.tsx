import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export function IgnoredResourceIcon({ produced, partial, size = 14, showTitle = true }: { produced: boolean; partial: boolean; size?: number; showTitle?: boolean }) {
  const label = produced ? "Produced" : partial ? "Partially supplied" : "Needed";
  const Icon = produced ? ArrowUpFromLine : ArrowDownToLine;
  return <span className="ignored-resource-kind" title={showTitle ? label : undefined} role="img" aria-label={label}><Icon size={size} aria-hidden="true" /></span>;
}
