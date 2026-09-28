"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Unlink, PackagePlus, SquareDashed, Copy, Scissors, ClipboardPaste, CircleCheck, Ban } from "lucide-react";
import {
  Handle,
  EdgeLabelRenderer,
  Position,
  useInternalNode,
  useReactFlow,
  useUpdateNodeInternals,
  useStore,
} from "@xyflow/react";
import {
  hasRecipeTiming,
  hasIngredientPort,
  rate,
  type Recipe,
} from "@/lib/model";
import { GRID_SIZE } from "@/lib/diagram-geometry";
import { ItemTooltip } from "@/components/item-tooltip";
import { usePortItemHighlight } from "./port-item-highlight";
import { useDisplaySettings } from "./display-settings";
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
  disabledPorts,
  togglePort,
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
  disabledPorts?: string[];
  togglePort: (id: string, handle: string) => void;
  color: (id: string) => string;
  connected: Set<string>;
  selectedConnections: Map<string, string[]>;
  disconnect: (id: string) => void;
  commit: (id: string, rows: PortRows) => void;
}) {
  const node = useInternalNode(id);
  const highlight = usePortItemHighlight();
  const { settings } = useDisplaySettings();
  const overview = useStore((state) => state.transform[2] < settings.overviewZoom);
  const flow = useReactFlow();
  const connectionTarget = useStore((state) => state.connection.isValid && state.connection.toNode?.id === id
    ? state.connection.toHandle?.id : null);
  const update = useUpdateNodeInternals();
  const [preview, setPreview] = useState<PortRows | null>(null);
  const [menu, setMenu] = useState<{ handle: string; x: number; y: number } | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const rightStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (!menuElement.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", close);
    window.addEventListener("wheel", close, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", close);
      window.removeEventListener("wheel", close, true);
    };
  }, [menu]);
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
      {menu && !connected.has(`${id}/${menu.handle}`) && createPortal(
        <div
          ref={menuElement}
          role="menu"
          className="port-context-menu nodrag nopan"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          <button type="button" role="menuitem" disabled>
            <PackagePlus size={16} aria-hidden="true" /> Add item card
          </button>
          <button type="button" role="menuitem" disabled>
            <SquareDashed size={16} aria-hidden="true" /> Add grouping
          </button>
          <div role="separator" className="diagram-menu-divider" />
          <button type="button" role="menuitem" disabled>
            <Copy size={16} aria-hidden="true" /> Copy
          </button>
          <button type="button" role="menuitem" disabled>
            <Scissors size={16} aria-hidden="true" /> Cut
          </button>
          <button type="button" role="menuitem" disabled>
            <ClipboardPaste size={16} aria-hidden="true" /> Paste
          </button>
          <div role="separator" className="diagram-menu-divider" />
          <button type="button" role="menuitem" autoFocus onClick={() => {
            togglePort(id, menu.handle);
            setMenu(null);
          }}>
            {disabledPorts?.includes(menu.handle)
              ? <CircleCheck size={16} aria-hidden="true" />
              : <Ban size={16} aria-hidden="true" />}
            {disabledPorts?.includes(menu.handle) ? "Enable" : "Disable"}
          </button>
        </div>, document.body,
      )}
      {sides.map(({ direction, ingredients, rows }) => (
        <div className={`ports ${direction}`} key={direction}>
          {ingredients.map((ingredient) => {
            const handle = `${direction}:${ingredient.slot}`;
            const row = preview?.[handle] ?? rows[handle];
            const isConnected = connected.has(`${id}/${handle}`);
            const isDisabled = disabledPorts?.includes(handle) ?? false;
            const information = hasRecipeTiming(recipe) ? (
              <small>
                {ingredient.consumed
                  ? `${rate(ingredient, recipe, machines).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${ingredient.item.kind === "fluid" ? "mB" : "items"}/s`
                  : `${ingredient.amount * machines} reusable`}
                {ingredient.chance < 1 && direction === "output"
                  ? ` · ${ingredient.chance * 100}% expected`
                  : ""}
              </small>
            ) : null;
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
                  className={isDisabled ? "port-disabled" : connectionTarget === handle ? "connection-target" : undefined}
                  isConnectable={!isDisabled}
                  isConnectableStart={!isDisabled}
                  isConnectableEnd={!isDisabled}
                  style={{ borderColor: isDisabled ? "#555" : color(ingredient.itemId) }}
                  onPointerEnter={() => highlight.hover(ingredient.itemId)}
                  onPointerLeave={() => highlight.hover(null)}
                  title={isConnected ? undefined : `${ingredient.item.name.replace(/§[0-9a-fk-or]/gi, "")}\nRight-drag to move this port`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const moved = rightStart.current && Math.hypot(
                      event.clientX - rightStart.current.x,
                      event.clientY - rightStart.current.y,
                    ) > 4;
                    if (!isConnected && !moved) setMenu({
                      handle,
                      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 218)),
                      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 284)),
                    });
                  }}
                  onPointerDownCapture={(event) => {
                    if (event.button === 0) highlight.hold(ingredient.itemId);
                    if (event.button !== 2) return;
                    rightStart.current = { x: event.clientX, y: event.clientY };
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
                >
                  {isConnected && (
                    <ItemTooltip followPointer={false} placement={direction === "input" ? "side-left" : "side-right"}>
                      <strong>{ingredient.item.name.replace(/§[0-9a-fk-or]/gi, "")}</strong>
                      {information}
                    </ItemTooltip>
                  )}
                </Handle>
                {(selectedConnections.get(`${id}/${handle}`) ?? []).map(
                  (edgeId, index) => (
                    <EdgeLabelRenderer key={edgeId}>
                      <button
                        className={`port-disconnect nodrag nopan${overview ? " overview-hidden" : ""}`}
                        style={{
                          left:
                            (node?.internals.positionAbsolute.x ?? 0) +
                            (direction === "input"
                              ? -46 - index * 28
                              : (node?.measured.width ?? 0) + 22 + index * 28),
                          top: origin + row * GRID_SIZE,
                          zIndex: 2003,
                        }}
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
                    </EdgeLabelRenderer>
                  ),
                )}
                {!recipe.sourceItemId && (
                  <span
                    className={`port-name${overview ? " overview-hidden" : ""}`}
                    hidden={isConnected}
                  >
                    {ingredient.item.name}
                    {information}
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
