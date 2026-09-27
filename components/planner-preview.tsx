"use client";
import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ReactFlow, Controls, ViewportPortal, applyNodeChanges, useReactFlow } from "@xyflow/react";
import { WandSparkles } from "lucide-react";
import { MachineCard, EditorContext } from "./machine-card";
import { GridEdge, type DiagramEdge } from "./grid-edge";
import { GridBackground } from "./grid-background";
import { ItemSlot } from "./recipe-view";
import { AutoRecipePlanner, type PlannedGraph } from "./auto-recipe-planner";
import { applyVariants, itemColor, port, rate, supplyColor, connectionColors, hasRecipeTiming, type Item } from "@/lib/model";
import { overclockRecipe } from "@/lib/recipe-overclock";
import { connectionSummary } from "@/lib/connection-summary";
import { fluidReferenceFlow } from "@/lib/fluid-reference";
import { appendPlannerBranch } from "@/lib/planner-branch";
import { useDisplaySettings } from "./display-settings";
import { initialRoute } from "@/lib/initial-route";
import { PlannerWindow } from "./planner-window";

const nodeTypes = { recipe: MachineCard };
const edgeTypes = { grid: GridEdge };
type IngredientTarget = { nodeId: string; slot: number; item: Item };

export function PlannerPreview({ graph, onChange }: { graph: PlannedGraph; onChange: (graph: PlannedGraph) => void }) {
  const wheelBoundary = `planner-wheel-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const inherited = useContext(EditorContext);
  const { settings } = useDisplaySettings();
  const flow = useReactFlow();
  const [menu, setMenu] = useState<{ x: number; y: number; targets: IngredientTarget[] }>();
  const [branch, setBranch] = useState<IngredientTarget & { x: number; y: number }>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!graph.nodes.every(n => n.measured?.width && n.measured?.height)) return;
    let changed = false;
    const edges = graph.edges.map(edge => {
      if (edge.data?.waypoints) return edge;
      const source = flow.getInternalNode(edge.source), target = flow.getInternalNode(edge.target);
      const a = source?.internals.handleBounds?.source?.find(h => h.id === edge.sourceHandle);
      const b = target?.internals.handleBounds?.target?.find(h => h.id === edge.targetHandle);
      if (!source || !target || !a || !b) return edge;
      changed = true;
      const waypoints = initialRoute(
        { x: source.position.x + a.x + a.width / 2, y: source.position.y + a.y + a.height / 2 },
        { x: target.position.x + b.x + b.width / 2, y: target.position.y + b.y + b.height / 2 },
        source.id, target.id, graph.nodes.map(n => ({ id: n.id, ...n.position, width: n.measured!.width!, height: n.measured!.height! })),
      );
      return { ...edge, data: { ...edge.data, waypoints } };
    });
    if (changed) onChange({ ...graph, edges });
  }, [graph, flow, onChange]);
  const connected = new Set(graph.edges.flatMap(e => [`${e.source}/${e.sourceHandle}`, `${e.target}/${e.targetHandle}`]));
  const updateNode = (id: string, patch: Record<string, unknown>) => onChange({ ...graph, nodes: graph.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n) });
  const recipeFor = (id: string) => {
    const node = graph.nodes.find(n => n.id === id)!;
    return overclockRecipe(applyVariants(node.data.recipe, node.data.variants), node.data.machineId);
  };
  const edges: DiagramEdge[] = graph.edges.map(edge => {
    const source = graph.nodes.find(n => n.id === edge.source)!;
    const target = graph.nodes.find(n => n.id === edge.target)!;
    const sr = recipeFor(source.id), tr = recipeFor(target.id);
    const output = port(sr, edge.sourceHandle!), input = port(tr, edge.targetHandle!);
    if (!output || !input) return edge as DiagramEdge;
    const summary = connectionSummary(output, sr, source.data.machines, input, tr, target.data.machines);
    const reference = edge.data?.reference ? fluidReferenceFlow(output, sr, source.data.machines, input, tr, target.data.machines) : undefined;
    const supplied = graph.edges.filter(e => e.target === edge.target && e.targetHandle === edge.targetHandle && !e.data?.reference).reduce((total, e) => {
      const n = graph.nodes.find(n => n.id === e.source)!;
      const r = recipeFor(n.id), ingredient = port(r, e.sourceHandle!);
      return total + (ingredient ? rate(ingredient, r, n.data.machines) : 0);
    }, 0);
    return { ...edge, type: "grid", data: { ...edge.data, item: output.item,
      setCardVisible: (overview, visible) => onChange({ ...graph, edges: graph.edges.map(e => e.id === edge.id ? { ...e, data: { ...e.data, [overview ? "showOverviewCard" : "showLineCard"]: visible } } : e) }),
      moveLabel: (id, point, mode) => onChange({ ...graph, edges: graph.edges.map(e => e.id === id ? { ...e, data: { ...e.data, [mode ? "imagePosition" : "labelPosition"]: point } } : e) }),
      movePoints: (id, points) => onChange({ ...graph, edges: graph.edges.map(e => e.id === id ? { ...e, data: { ...e.data, waypoints: points, labelPosition: undefined, imagePosition: undefined } } : e) }),
    }, style: { stroke: reference?.color ?? (hasRecipeTiming(tr) ? supplyColor(supplied, rate(input, tr, target.data.machines)) : connectionColors.unrated), strokeWidth: settings.lineThickness },
    label: <><div className="connection-card-heading" data-planner-target={edge.target} data-planner-slot={input.slot}><span className={`connection-card-image${output.item.kind === "fluid" ? " fluid" : ""}`}><ItemSlot item={output.item} tooltipAtPointer /></span><div className="connection-card-heading-text"><strong className="connection-item">{summary.item}</strong><div className="connection-ratio">{reference ? `${reference.liters} L / container` : summary.ratio}</div></div></div><div className="connection-rates"><strong>{summary.from}</strong><span>→</span><strong>{summary.target}</strong></div></> as ReactNode };
  });
  return <EditorContext.Provider value={{ ...inherited, browse: () => {}, connected, selectedConnections: new Map(), color: itemColor,
    count: (id, machines) => updateNode(id, { machines }), selectMachine: (id, machineId) => updateNode(id, { machineId }),
    movePorts: (id, portRows) => updateNode(id, { portRows }), togglePort: () => {},
    disconnect: id => onChange({ ...graph, edges: graph.edges.filter(e => e.id !== id) }),
    remove: id => onChange({ nodes: graph.nodes.filter(n => n.id !== id), edges: graph.edges.filter(e => e.source !== id && e.target !== id) }),
  }}>
    <div style={{ height: "100%" }} onPointerDown={() => setMenu(undefined)} onContextMenuCapture={event => {
      const element = event.target as HTMLElement;
      if (element.closest(".planner-inline")) return;
      const lineItem = element.closest("[data-planner-target]");
      const nodeId = lineItem?.getAttribute("data-planner-target") ?? element.closest(".react-flow__node")?.getAttribute("data-id");
      const itemId = element.closest("[data-item-id]")?.getAttribute("data-item-id");
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;
      const targets = applyVariants(node.data.recipe, node.data.variants).ingredients.filter(i => i.direction === "input" && i.amount > 0 && (lineItem ? i.slot === Number(lineItem.getAttribute("data-planner-slot")) : !itemId || i.itemId === itemId)).map(i => ({ nodeId: node.id, slot: i.slot, item: i.item }));
      if (!targets.length) return;
      event.preventDefault(); event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, targets });
    }}>
      <ReactFlow nodes={graph.nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        noWheelClassName={wheelBoundary}
        onNodesChange={changes => onChange({ ...graph, nodes: applyNodeChanges(changes, graph.nodes) })}
        fitView fitViewOptions={{ padding: .15, maxZoom: 1 }} minZoom={.02} maxZoom={2}
        nodesConnectable={false} deleteKeyCode={null} colorMode="dark" panOnDrag={[1]}>
        <GridBackground /><Controls showInteractive={false} />
        {branch && <ViewportPortal><PlannerWindow key={`${branch.nodeId}/${branch.slot}`} x={branch.x} y={branch.y} wheelBoundary={wheelBoundary}>
          {error && <p role="alert">{error}</p>}
          <AutoRecipePlanner key={`${branch.nodeId}/${branch.slot}`} embedded initialTarget={branch.item} onClose={() => setBranch(undefined)} onAdd={addition => {
            try { onChange(appendPlannerBranch(graph, addition, branch.nodeId, branch.slot, crypto.randomUUID())); setBranch(undefined); setError(""); requestAnimationFrame(() => flow.fitView({ padding: .15 })); }
            catch (e) { setError((e as Error).message); }
          }} />
        </PlannerWindow></ViewportPortal>}
      </ReactFlow>
    </div>
    {menu && createPortal(<div role="menu" className="diagram-selection-menu line-context-menu planner-context-menu" style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 300), top: Math.min(menu.y, window.innerHeight - 180), zIndex: 100000 }} onPointerDown={e => e.stopPropagation()}>
      {menu.targets.map(t => <button role="menuitem" key={t.slot} onClick={() => { const node = graph.nodes.find(n => n.id === t.nodeId)!; setBranch({ ...t, x: node.position.x - 1200, y: node.position.y }); setMenu(undefined); setError(""); void flow.setCenter(node.position.x - 650, node.position.y + 300, { zoom: .65, duration: 250 }); }}><WandSparkles size={16} />Plan production of {t.item.name.replace(/§./g, "")}</button>)}
    </div>, document.body)}
  </EditorContext.Provider>;
}
