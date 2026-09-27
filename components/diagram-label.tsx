"use client";
import { useEffect, useRef } from "react";
import type { NodeProps } from "@xyflow/react";
import type { RecipeNode } from "./machine-card";
import { GripHorizontal, X } from "lucide-react";

type LabelData = RecipeNode["data"] & {
  updateLabel?: (patch: { text?: string; fontSize?: number; textColor?: string; backgroundColor?: string }) => void;
  removeLabel?: () => void;
};

export function DiagramLabel({ data, selected }: NodeProps<RecipeNode>) {
  const label = data as LabelData;
  const { text, removeLabel } = label;
  const wasSelected = useRef(selected);
  useEffect(() => {
    const deselected = wasSelected.current && !selected;
    wasSelected.current = selected;
    if (deselected && !(text ?? "Label").trim()) removeLabel?.();
  }, [selected, text, removeLabel]);
  return <div className={`diagram-label${selected ? " selected" : ""}`} style={{ color: label.textColor ?? "#ffffff", backgroundColor: label.backgroundColor ?? "transparent" }}>
    {selected && <div className="diagram-label-controls">
      <GripHorizontal size={18} aria-label="Drag label" />
      <select className="nodrag nopan" aria-label="Label font size" value={label.fontSize ?? 30}
        onChange={e => label.updateLabel?.({ fontSize: Number(e.target.value) })}>
        {[8, 10, 12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 48, 64, 72, 96, 120, 144].map(size => <option key={size} value={size}>{size}</option>)}
      </select>
      <label className="nodrag nopan">Text <input type="color" aria-label="Label text color" value={label.textColor ?? "#ffffff"} onChange={e => label.updateLabel?.({ textColor: e.target.value })} /></label>
      <label className="nodrag nopan">Background <input type="color" aria-label="Label background color" value={label.backgroundColor && label.backgroundColor !== "transparent" ? label.backgroundColor : "#111111"} onChange={e => label.updateLabel?.({ backgroundColor: e.target.value })} /></label>
      <label className="nodrag nopan"><input type="checkbox" aria-label="Transparent label background" checked={!label.backgroundColor || label.backgroundColor === "transparent"} onChange={e => label.updateLabel?.({ backgroundColor: e.target.checked ? "transparent" : "#111111" })} />Transparent</label>
      <button className="nodrag nopan" aria-label="Delete label" onClick={() => label.removeLabel?.()}><X size={15} /></button>
    </div>}
    {selected ? <div className="diagram-label-editor" style={{ fontSize: label.fontSize ?? 30 }}>
      <div className="diagram-label-measure" aria-hidden="true">{label.text ?? "Label"}{"\u200b"}</div>
      <textarea className="nodrag nopan nowheel" aria-label="Label text" maxLength={5000} wrap="off"
      value={label.text ?? "Label"}
      rows={Math.max(1, (label.text ?? "Label").split("\n").length)}
      onChange={e => label.updateLabel?.({ text: e.target.value })} /></div>
      : <div className="diagram-label-text" style={{ fontSize: label.fontSize ?? 30 }}>{label.text || "Label"}</div>}
  </div>;
}
