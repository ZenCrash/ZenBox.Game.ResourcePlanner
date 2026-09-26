"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Unlink } from "lucide-react";
import {
  Handle,
  Position,
  useInternalNode,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import {
  hasRecipeTiming,
  hasIngredientPort,
  rate,
  type Recipe,
} from "@/lib/model";
import { GRID_SIZE } from "@/lib/diagram-geometry";
import {
  initialPortRows,
  previewPortMove,
  type PortRows,
} from "@/lib/port-layout";

export function RecipePorts({
  id,
  recipe,
  machines,
  saved,
  color,
  connected,
  selectedConnections,
  disconnect,
  commit,
}: {
  id: string;
  recipe: Recipe;
  machines: number;
  saved?: PortRows;
  color: (id: string) => string;
  connected: Set<string>;
  selectedConnections: Map<string, string[]>;
  disconnect: (id: string) => void;
  commit: (id: string, rows: PortRows) => void;
}) {
  const node = useInternalNode(id);
  const flow = useReactFlow();
  const update = useUpdateNodeInternals();
  const [preview, setPreview] = useState<PortRows | null>(null);
  const drag = useRef<{
    handle: string;
    original: PortRows;
    preview: PortRows;
    startY: number;
    row: number;
    max: number;
  } | null>(null);
  const nodeY = node?.internals.positionAbsolute.y ?? 0;
  const origin = Math.round(nodeY / GRID_SIZE) * GRID_SIZE;
  const sides = (["input", "output"] as const).map((direction) => {
    const ingredients = recipe.ingredients.filter(
      (i) => i.direction === direction && hasIngredientPort(i),
    );
    return {
      direction,
      ingredients,
      rows: initialPortRows(
        ingredients.map((i) => `${direction}:${i.slot}`),
        saved,
      ),
    };
  });
  const layoutKey = JSON.stringify([saved, preview, nodeY]);
  useLayoutEffect(() => {
    update(id);
  }, [id, update, layoutKey]);
  return (
    <>
      {sides.map(({ direction, ingredients, rows }) => (
        <div className={`ports ${direction}`} key={direction}>
          {ingredients.map((ingredient) => {
            const handle = `${direction}:${ingredient.slot}`;
            const row = preview?.[handle] ?? rows[handle];
            return (
              <div
                className="port-row"
                key={handle}
                style={{ top: origin - nodeY + row * GRID_SIZE }}
              >
                <Handle
                  id={handle}
                  type={direction === "input" ? "target" : "source"}
                  position={
                    direction === "input" ? Position.Left : Position.Right
                  }
                  style={{ borderColor: color(ingredient.itemId) }}
                  title={`${ingredient.item.name.replace(/§[0-9a-fk-or]/gi, "")}\nRight-drag to move this port`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDownCapture={(event) => {
                    if (event.button !== 2) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const pointer = flow.screenToFlowPosition({
                      x: event.clientX,
                      y: event.clientY,
                    });
                    const max = Math.max(
                      ...Object.values(rows),
                      Math.floor(
                        ((node?.measured.height ?? 200) -
                          20 -
                          (origin - nodeY)) /
                          GRID_SIZE,
                      ),
                    );
                    drag.current = {
                      handle,
                      original: rows,
                      preview: rows,
                      startY: pointer.y,
                      row: rows[handle],
                      max,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const active = drag.current;
                    if (!active || active.handle !== handle) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const pointer = flow.screenToFlowPosition({
                      x: event.clientX,
                      y: event.clientY,
                    });
                    active.preview = previewPortMove(
                      active.original,
                      handle,
                      active.row + (pointer.y - active.startY) / GRID_SIZE,
                      1,
                      active.max,
                    );
                    setPreview(active.preview);
                  }}
                  onPointerUp={(event) => {
                    const active = drag.current;
                    if (!active || active.handle !== handle) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (
                      JSON.stringify(active.preview) !==
                      JSON.stringify(active.original)
                    )
                      commit(id, { ...saved, ...active.preview });
                    drag.current = null;
                    setPreview(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setPreview(null);
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                    setPreview(null);
                  }}
                />
                {(selectedConnections.get(`${id}/${handle}`) ?? []).map(
                  (edgeId, index) => (
                    <button
                      key={edgeId}
                      className="port-disconnect nodrag nopan"
                      style={
                        direction === "input"
                          ? { right: 22 + index * 28 }
                          : { left: 22 + index * 28 }
                      }
                      aria-label={`Disconnect ${ingredient.item.name.replace(/§[0-9a-fk-or]/gi, "")}`}
                      title="Disconnect line"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        disconnect(edgeId);
                      }}
                    >
                      <Unlink size={16} />
                    </button>
                  ),
                )}
                {!recipe.sourceItemId && (
                  <span
                    className="port-name"
                    hidden={connected.has(`${id}/${handle}`)}
                  >
                    {ingredient.item.name}
                    {hasRecipeTiming(recipe) && (
                      <small>
                        {ingredient.consumed
                          ? `${rate(ingredient, recipe, machines).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${ingredient.item.kind === "fluid" ? "mB" : "items"}/s`
                          : `${ingredient.amount * machines} reusable`}
                        {ingredient.chance < 1 && direction === "output"
                          ? ` · ${ingredient.chance * 100}% expected`
                          : ""}
                      </small>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
