"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Panel,
  MiniMap,
  ConnectionMode,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  X,
  Workflow,
  Undo2,
  Redo2,
  PackagePlus,
  SquareDashed,
} from "lucide-react";
import {
  blankDiagram,
  itemColor,
  createPortColorResolver,
  portsCompatible,
  port,
  connectionColors,
  hasRecipeTiming,
  hasIngredientPort,
  rate,
  supplyColor,
  itemSourceRecipe,
  recipeTabIcon,
  applyVariants,
  resolveDiagramVariants,
  type VariantSelection,
  type DiagramDocument,
  type Item,
  type Recipe,
} from "@/lib/model";
import { api, type Project } from "./project-list";
import { Inventory } from "./inventory";
import { DiagramActions } from "./diagram-actions";
import {
  CyclingRecipe,
  ItemSlot,
  RecipeView,
  type Browse,
} from "./recipe-view";
import { GridEdge, type DiagramEdge } from "./grid-edge";
import { GRID_SIZE, snapPoint } from "@/lib/diagram-geometry";
import { exportDiagram, download } from "@/lib/export";
import { connectionSummary } from "@/lib/connection-summary";
import { RecipePorts } from "./recipe-ports";
import type { PortRows } from "@/lib/port-layout";
import { useGraphHistory } from "./use-graph-history";
import { copySelection, pasteSelection } from "@/lib/editor-clipboard";
import { CanvasSelection } from "./canvas-selection";
import { moveConnectedEdges } from "@/lib/canvas-interactions";
import { SummaryArea } from "./summary-area";
import { summarizeArea, summaryRecipe } from "@/lib/area-summary";
import type { SummaryCalculation } from "@/lib/summary-rate";
type RecipeNode = Node<
  {
    recipe: Recipe;
    machines: number;
    variants: VariantSelection;
    portRows?: PortRows;
    calculators?: SummaryCalculation[];
  },
  "recipe" | "summary"
>;
const EditorContext = createContext<{
  browse: Browse;
  count: (id: string, value: number) => void;
  color: (itemId: string) => string;
  connected: Set<string>;
  selectedConnections: Map<string, string[]>;
  disconnect: (id: string) => void;
  movePorts: (id: string, rows: PortRows) => void;
  remove: (id: string) => void;
}>({
  browse: () => {},
  count: () => {},
  color: itemColor,
  connected: new Set(),
  selectedConnections: new Map(),
  disconnect: () => {},
  movePorts: () => {},
  remove: () => {},
});
function MachineCard({ id, data, selected }: NodeProps<RecipeNode>) {
  const {
      browse,
      count,
      color,
      connected,
      movePorts,
      remove,
      selectedConnections,
      disconnect,
    } = useContext(EditorContext),
    recipe = applyVariants(data.recipe, data.variants);
  const ports = (
    <RecipePorts
      id={id}
      recipe={recipe}
      machines={data.machines}
      saved={data.portRows}
      color={color}
      connected={connected}
      selectedConnections={selectedConnections}
      disconnect={disconnect}
      commit={movePorts}
    />
  );
  const deleteButton = (
    <button
      className="recipe-delete nodrag nopan"
      aria-label="Delete recipe"
      title="Delete recipe"
      onClick={(event) => {
        event.stopPropagation();
        remove(id);
      }}
    >
      <X size={15} />
    </button>
  );
  if (recipe.sourceItemId) {
    const item = recipe.ingredients[0].item;
    return (
      <div className={`machine-card ${selected ? "selected" : ""}`}>
        <div className="recipe-view item-source-card">
          <div className="recipe-title">Item source</div>
          {deleteButton}
          <div className="item-source-content">
            <ItemSlot item={item} onBrowse={browse} />
            <span>{item.name}</span>
          </div>
        </div>
        {ports}
      </div>
    );
  }
  return (
    <div className={`machine-card ${selected ? "selected" : ""}`}>
      <RecipeView
        recipe={recipe}
        onBrowse={browse}
        minHeight={
          Math.max(
            ...["input", "output"].map(
              (direction) =>
                recipe.ingredients.filter((i) => i.direction === direction)
                  .length,
            ),
          ) *
            42 +
          64
        }
      >
        {deleteButton}
        <label className="machine-count nodrag">
          Machines{" "}
          <input
            type="number"
            min={0}
            max={1e9}
            step="any"
            value={data.machines}
            onChange={(e) => {
              const value = e.target.valueAsNumber;
              if (Number.isFinite(value) && value >= 0 && value <= 1e9)
                count(id, value);
            }}
          />
        </label>
      </RecipeView>
      {ports}
    </div>
  );
}
const nodeTypes = { recipe: MachineCard, summary: SummaryArea };
const edgeTypes = { grid: GridEdge };
export function Workspace({ project }: { project: Project }) {
  return (
    <ReactFlowProvider>
      <Editor project={project} />
    </ReactFlowProvider>
  );
}
function Editor({ project }: { project: Project }) {
  const [itemPicker, setItemPicker] = useState(false);
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useGraphHistory<RecipeNode, DiagramEdge>();
  const clipboard = useRef<{
    nodes: RecipeNode[];
    edges: DiagramEdge[];
    text: string;
  } | null>(null);
  const recipeTabs = useRef<HTMLDivElement>(null);
  const [selectionMenu, setSelectionMenu] = useState<{
    x: number;
    y: number;
    canPaste: boolean;
    onSelection: boolean;
  } | null>(null);
  const contextStart = useRef<{ x: number; y: number } | null>(null);
  const recipeContent = useRef<HTMLDivElement>(null);
  const recipeTabBar = useRef<HTMLDivElement>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const [diagrams, setDiagrams] = useState(project.diagrams),
    [active, setActive] = useState(""),
    [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<"create" | "delete" | null>(null),
    [diagramName, setDiagramName] = useState(""),
    [busy, setBusy] = useState(false);
  const [browser, setBrowser] = useState<{
      item: Item;
      mode: "recipes" | "uses";
    } | null>(null),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [recipeLoading, setRecipeLoading] = useState(false),
    [handler, setHandler] = useState(""),
    [recipePage, setRecipePage] = useState(0),
    [history, setHistory] = useState<
      { item: Item; mode: "recipes" | "uses" }[]
    >([]);
  useEffect(() => {
    const strip = recipeTabs.current;
    const bar = recipeTabBar.current;
    if (!strip || !bar) return;
    const measure = () => {
      const buttons = Array.from(strip.children) as HTMLElement[];
      const needed =
        buttons.reduce((sum, button) => sum + button.offsetWidth, 0) +
        Math.max(0, buttons.length - 1) * 3 +
        6;
      setTabsOverflow(needed > bar.clientWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => observer.disconnect();
  }, [browser, recipes]);
  useEffect(() => {
    const content = recipeContent.current;
    const card = content?.querySelector<HTMLElement>(".recipe-view");
    if (!content || !card) return;
    const measure = () => {
      const bounds = card.getBoundingClientRect();
      const count = content.querySelectorAll(
        ".recipe-machine-slots > .item-slot",
      ).length;
      // Slots are 32px with 3px gaps, plus 16px vertical padding/borders.
      const rows = Math.max(
        1,
        Math.min(count, Math.floor((bounds.height - 13) / 35)),
      );
      const columns = Math.max(1, Math.ceil(count / rows));
      const width = 48 + (columns - 1) * 35;
      content.style.setProperty(
        "--machine-strip-top",
        `${bounds.top - content.getBoundingClientRect().top}px`,
      );
      content.style.setProperty("--machine-strip-rows", String(rows));
      content.style.setProperty("--machine-strip-width", `${width}px`);
      content
        .closest<HTMLElement>(".recipe-dialog")
        ?.style.setProperty(
          "--machine-extra-width",
          `${count ? width - 48 : 0}px`,
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [browser, recipes, handler, recipePage]);
  const revision = useRef(0),
    flow = useRef<ReactFlowInstance<RecipeNode, DiagramEdge> | null>(null),
    epoch = useRef(0),
    browserEpoch = useRef(0),
    generation = useRef(0),
    dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    generation.current++;
    dirtyRef.current = true;
    setDirty(true);
  }, []);
  const insertionPoint = useCallback(() => {
    const area = window.document
      .querySelector(".flow-canvas")
      ?.getBoundingClientRect();
    return snapPoint(
      flow.current?.screenToFlowPosition({
        x: (area?.left ?? 0) + 50,
        y: (area?.top ?? 0) + 70,
      }) ?? { x: 60, y: 80 },
    );
  }, []);
  const document = useCallback(
    (): DiagramDocument => ({
      ...blankDiagram(),
      revision: revision.current,
      nodes: nodes
        .filter((n) => n.type !== "summary")
        .map((n) => ({
          id: n.id,
          recipeId: n.data.recipe.id,
          ...(n.data.recipe.sourceItemId
            ? { itemId: n.data.recipe.sourceItemId }
            : {}),
          machines: n.data.machines,
          ...(n.measured?.width && n.measured?.height
            ? { size: { width: n.measured.width, height: n.measured.height } }
            : {}),
          position: n.position,
          variants: n.data.variants,
          ...(n.data.portRows ? { portRows: n.data.portRows } : {}),
        })),
      areas: nodes
        .filter((n) => n.type === "summary")
        .map((n) => ({
          id: n.id,
          position: n.position,
          width: n.width ?? 640,
          height: n.height ?? 480,
          calculators: n.data.calculators,
        })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle!,
        targetHandle: e.targetHandle!,
        ...(e.data?.bend ? { bend: e.data.bend } : {}),
        ...(e.data?.targetBendX !== undefined
          ? { targetBendX: e.data.targetBendX }
          : {}),
        ...(e.data?.waypoints ? { waypoints: e.data.waypoints } : {}),
        ...(e.data?.labelPosition
          ? { labelPosition: e.data.labelPosition }
          : {}),
      })),
      viewport: flow.current?.getViewport() ?? blankDiagram().viewport,
    }),
    [nodes, edges],
  );
  const save = useCallback(async () => {
    if (!active || !ready || saving) return false;
    setSaving(true);
    const snapshot = generation.current;
    try {
      const result = await api<{ revision: number }>(
        `/api/diagrams/${active}`,
        { method: "PUT", body: JSON.stringify(document()) },
      );
      revision.current = result.revision;
      if (snapshot === generation.current) {
        setDirty(false);
        dirtyRef.current = false;
      }
      setError("");
      return snapshot === generation.current;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [active, ready, saving, document]);
  const load = useCallback(
    async (id: string) => {
      const token = ++epoch.current;
      setReady(false);
      setError("");
      try {
        let doc = await api<DiagramDocument>(`/api/diagrams/${id}`);
        const unique = [
          ...new Set(doc.nodes.filter((n) => !n.itemId).map((n) => n.recipeId)),
        ];
        const loaded: Recipe[] = [];
        for (let offset = 0; offset < unique.length; offset += 40)
          loaded.push(
            ...(await api<Recipe[]>(
              `/api/recipes?ids=${encodeURIComponent(unique.slice(offset, offset + 40).join(","))}`,
            )),
          );
        const itemIds = [
          ...new Set(doc.nodes.flatMap((n) => (n.itemId ? [n.itemId] : []))),
        ];
        for (let offset = 0; offset < itemIds.length; offset += 40) {
          const items = await api<Item[]>(
            `/api/items?ids=${encodeURIComponent(itemIds.slice(offset, offset + 40).join(","))}`,
          );
          loaded.push(...items.map(itemSourceRecipe));
        }
        if (epoch.current !== token) return;
        doc = resolveDiagramVariants(doc, loaded);
        const map = new Map(loaded.map((r) => [r.id, r]));
        if (doc.nodes.some((n) => !map.has(n.recipeId)))
          throw new Error(
            "This diagram references recipes missing from the installed catalog. Restore its catalog before editing.",
          );
        setNodes([
          ...doc.nodes.map((n): RecipeNode => ({
            id: n.id,
            type: "recipe",
            position: n.position,
            data: {
              recipe: map.get(n.recipeId)!,
              machines: n.machines,
              variants: n.variants,
              portRows: n.portRows,
            },
          })),
          ...(doc.areas ?? []).map((area): RecipeNode => ({
            id: area.id,
            type: "summary",
            position: area.position,
            width: area.width,
            height: area.height,
            zIndex: -100,
            dragHandle: ".summary-area-header",
            data: {
              recipe: summaryRecipe,
              machines: 0,
              variants: {},
              calculators: area.calculators,
            },
          })),
        ]);
        setEdges(
          doc.edges.map((edge) => ({
            ...edge,
            data: {
              bend: edge.bend,
              targetBendX: edge.targetBendX,
              waypoints: edge.waypoints,
              labelPosition: edge.labelPosition,
            },
          })),
        );
        revision.current = doc.revision;
        resetHistory();
        setActive(id);
        setDirty(false);
        dirtyRef.current = false;
        setReady(true);
        flow.current?.setViewport(doc.viewport);
        window.history.replaceState(null, "", `?diagram=${id}`);
      } catch (e) {
        if (epoch.current === token) setError((e as Error).message);
      }
    },
    [resetHistory, setNodes, setEdges],
  );
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("diagram");
    const initial =
      project.diagrams.find((d) => d.id === fromUrl) ?? project.diagrams[0];
    // Loading synchronizes a server document after the initial render.
    if (initial) {
      const timer = setTimeout(() => void load(initial.id), 0);
      return () => clearTimeout(timer);
    }
  }, [load, project.diagrams]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key === "Escape") {
        setSelectionMenu(null);
        setItemPicker(false);
        setBrowser(null);
        setDialog(null);
      }
      const editing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          !!e.target.closest("input,textarea,select"));
      if (
        !ready ||
        browser ||
        dialog ||
        itemPicker ||
        editing ||
        !(e.ctrlKey || e.metaKey)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey ? canRedo : canUndo) {
          (e.shiftKey ? redo : undo)();
          markDirty();
        }
      }
    };
    const transfer = (e: ClipboardEvent) => {
      const editing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          !!e.target.closest("input,textarea,select"));
      if (
        !ready ||
        browser ||
        dialog ||
        itemPicker ||
        editing ||
        !e.clipboardData
      )
        return;
      if (e.type === "copy" || e.type === "cut") {
        const copied = copySelection({ nodes, edges });
        if (!copied.nodes.length) return;
        e.preventDefault();
        const text = JSON.stringify({
          type: "resource-planner-selection",
          id: crypto.randomUUID(),
          ...copied,
        });
        clipboard.current = { ...copied, text };
        e.clipboardData.setData("text/plain", text);
        if (e.type === "cut") {
          const ids = new Set(copied.nodes.map((n) => n.id));
          setNodes((values) => values.filter((n) => !ids.has(n.id)));
          setEdges((values) =>
            values.filter(
              (edge) => !ids.has(edge.source) && !ids.has(edge.target),
            ),
          );
          markDirty();
        }
      }
      if (
        e.type === "paste" &&
        clipboard.current &&
        e.clipboardData.getData("text/plain") === clipboard.current.text
      ) {
        e.preventDefault();
        const pasted = pasteSelection(clipboard.current, insertionPoint(), () =>
          crypto.randomUUID(),
        );
        setNodes((values) => [
          ...values.map((n) => ({ ...n, selected: false })),
          ...pasted.nodes,
        ]);
        setEdges((values) => [
          ...values.map((edge) => ({ ...edge, selected: false })),
          ...pasted.edges,
        ]);
        markDirty();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("copy", transfer);
    window.addEventListener("cut", transfer);
    window.addEventListener("paste", transfer);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("copy", transfer);
      window.removeEventListener("cut", transfer);
      window.removeEventListener("paste", transfer);
    };
  }, [
    save,
    ready,
    browser,
    dialog,
    itemPicker,
    nodes,
    edges,
    canUndo,
    canRedo,
    undo,
    redo,
    markDirty,
    insertionPoint,
    setNodes,
    setEdges,
  ]);
  const browse: Browse = useCallback(
    async (item, mode) => {
      if (browser) setHistory((h) => [...h, browser]);
      const token = ++browserEpoch.current;
      setBrowser({ item, mode });
      setRecipeLoading(true);
      setRecipes([]);
      setRecipePage(0);
      setHandler("");
      try {
        const list = await api<Recipe[]>(
          `/api/recipes?item=${encodeURIComponent(item.id)}&mode=${mode}`,
        );
        if (token === browserEpoch.current) {
          setRecipes(list);
          setHandler(list[0]?.handler ?? "");
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (token === browserEpoch.current) setRecipeLoading(false);
      }
    },
    [browser],
  );
  const portColor = useMemo(
    () => createPortColorResolver(nodes.map((node) => node.data.recipe)),
    [nodes],
  );
  const context = useMemo(
    () => ({
      browse,
      color: portColor,
      remove: (id: string) => {
        setNodes((values) => values.filter((node) => node.id !== id));
        setEdges((values) =>
          values.filter((edge) => edge.source !== id && edge.target !== id),
        );
        markDirty();
      },
      movePorts: (id: string, portRows: PortRows) => {
        setEdges((values) =>
          values.map((edge) =>
            edge.source === id || edge.target === id
              ? { ...edge, data: { ...edge.data, labelPosition: undefined } }
              : edge,
          ),
        );
        setNodes((ns) =>
          ns.map((node) =>
            node.id === id
              ? { ...node, data: { ...node.data, portRows } }
              : node,
          ),
        );
        markDirty();
      },
      connected: new Set(
        edges.flatMap((edge) => [
          `${edge.source}/${edge.sourceHandle}`,
          `${edge.target}/${edge.targetHandle}`,
        ]),
      ),
      selectedConnections: edges
        .filter((edge) => edge.selected)
        .reduce((ports, edge) => {
          for (const key of [
            `${edge.source}/${edge.sourceHandle}`,
            `${edge.target}/${edge.targetHandle}`,
          ])
            ports.set(key, [...(ports.get(key) ?? []), edge.id]);
          return ports;
        }, new Map<string, string[]>()),
      disconnect: (id: string) => {
        setEdges((values) => values.filter((edge) => edge.id !== id));
        markDirty();
      },
      count: (id: string, machines: number) => {
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, machines } } : n,
          ),
        );
        markDirty();
      },
    }),
    [browse, markDirty, portColor, edges, setNodes, setEdges],
  );
  function normalize(c: Connection): Connection {
    return c.sourceHandle?.startsWith("input:")
      ? {
          source: c.target,
          target: c.source,
          sourceHandle: c.targetHandle,
          targetHandle: c.sourceHandle,
        }
      : c;
  }
  function valid(connection: Connection | Edge) {
    const c = normalize(connection as Connection),
      a = nodes.find((n) => n.id === c.source),
      b = nodes.find((n) => n.id === c.target);
    if (!a || !b || a.id === b.id) return false;
    const output = port(a.data.recipe, c.sourceHandle),
      input = port(b.data.recipe, c.targetHandle);
    return (
      !!output &&
      !!input &&
      hasIngredientPort(output) &&
      hasIngredientPort(input) &&
      output.direction === "output" &&
      input.direction === "input" &&
      portsCompatible(output, input) &&
      !edges.some(
        (edge) =>
          edge.target === c.target &&
          edge.targetHandle === c.targetHandle &&
          port(
            nodes.find((node) => node.id === edge.source)!.data.recipe,
            edge.sourceHandle,
          )?.itemId !== output.itemId,
      ) &&
      !edges.some(
        (e) =>
          e.source === c.source &&
          e.target === c.target &&
          e.sourceHandle === c.sourceHandle &&
          e.targetHandle === c.targetHandle,
      )
    );
  }
  const selectEdge = (
    id: string,
    additive: boolean,
    toggle = true,
    preserveNodes = false,
  ) => {
    const edge = edges.find((value) => value.id === id);
    if (!edge) return;
    const selecting = !toggle || !edge.selected;
    setEdges((values) =>
      values.map((value) => ({
        ...value,
        selected: value.id === id ? selecting : additive && value.selected,
      })),
    );
    if (additive && selecting)
      setNodes((values) =>
        values.map((node) =>
          node.id === edge.source || node.id === edge.target
            ? { ...node, selected: true }
            : node,
        ),
      );
    else if (!additive && !preserveNodes)
      setNodes((values) =>
        values.map((node) => ({ ...node, selected: false })),
      );
  };
  const inputSupply = new Map<string, number>();
  for (const edge of edges) {
    const source = nodes.find((node) => node.id === edge.source);
    const output =
      source &&
      port(
        applyVariants(source.data.recipe, source.data.variants),
        edge.sourceHandle,
      );
    const key = `${edge.target}/${edge.targetHandle}`;
    const supplied =
      source && output && hasRecipeTiming(source.data.recipe)
        ? rate(output, source.data.recipe, source.data.machines)
        : NaN;
    inputSupply.set(key, (inputSupply.get(key) ?? 0) + supplied);
  }
  const renderedEdges = edges.map((edge) => {
    const source = nodes.find((n) => n.id === edge.source),
      target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) return edge;
    const output = port(source.data.recipe, edge.sourceHandle),
      input = port(
        applyVariants(target.data.recipe, target.data.variants),
        edge.targetHandle,
      );
    if (!output || !input) return edge;
    const summary = connectionSummary(
      output,
      source.data.recipe,
      source.data.machines,
      input,
      target.data.recipe,
      target.data.machines,
    );
    return {
      ...edge,
      type: "grid",
      zIndex: edge.selected ? 2000 : 0,
      data: {
        ...edge.data,
        select: (additive: boolean, toggle?: boolean) =>
          selectEdge(edge.id, additive, toggle, true),
        moveLabel: (id: string, labelPosition: { x: number; y: number }) => {
          setEdges((values) =>
            values.map((value) =>
              value.id === id
                ? {
                    ...value,
                    selected: true,
                    data: { ...value.data, labelPosition },
                  }
                : value,
            ),
          );
          markDirty();
        },
        movePoints: (id: string, waypoints: { x: number; y: number }[]) => {
          setEdges((values) =>
            values.map((value) =>
              value.id === id
                ? {
                    ...value,
                    selected: true,
                    data: {
                      ...value.data,
                      waypoints,
                      labelPosition: undefined,
                    },
                  }
                : value,
            ),
          );
          markDirty();
        },
        moveBend: (
          id: string,
          point: { x: number; y: number },
          targetBendX: number,
        ) => {
          setEdges((es) =>
            es.map((value) =>
              value.id === id
                ? {
                    ...value,
                    data: {
                      ...value.data,
                      labelPosition: undefined,
                      bend: snapPoint(point),
                      targetBendX,
                    },
                  }
                : value,
            ),
          );
          markDirty();
        },
      },
      style: {
        stroke: hasRecipeTiming(target.data.recipe)
          ? supplyColor(
              inputSupply.get(`${edge.target}/${edge.targetHandle}`) ?? NaN,
              rate(input, target.data.recipe, target.data.machines),
            )
          : connectionColors.unrated,
        strokeWidth: 4,
      },
      label: (
        <>
          <strong className="connection-item">{summary.item}</strong>
          <div className="connection-ratio">{summary.ratio}</div>
          <div className="connection-rates">
            <strong>{summary.from}</strong>
            <span aria-label="to">→</span>
            <strong>{summary.target}</strong>
          </div>
        </>
      ),
      labelStyle: { fill: "#e7e7e5", fontSize: 11 },
      labelBgStyle: { fill: "#242927" },
      labelBgPadding: [9, 6] as [number, number],
    };
  });
  const current = diagrams.find((d) => d.id === active),
    filtered = recipes.filter((r) => r.handler === handler),
    selectedRecipe = filtered[recipePage];
  function addCard(recipe: Recipe, variants: VariantSelection = {}) {
    if (!ready) {
      setError("Create or open a diagram before adding a card.");
      return;
    }
    const position = insertionPoint();
    setNodes((ns) => [
      ...ns.map((node) => ({ ...node, selected: false })),
      {
        id: crypto.randomUUID(),
        type: "recipe",
        selected: true,
        position: snapPoint(position),
        data: { recipe, machines: 1, variants },
      },
    ]);
    setEdges((values) => values.map((edge) => ({ ...edge, selected: false })));
    markDirty();
    setBrowser(null);
  }
  function addRecipe(variants: VariantSelection) {
    if (selectedRecipe) addCard(selectedRecipe, variants);
  }
  function addArea() {
    if (!ready) return;
    setNodes((values) => [
      ...values.map((node) => ({ ...node, selected: false })),
      {
        id: crypto.randomUUID(),
        type: "summary",
        position: insertionPoint(),
        width: 640,
        height: 480,
        selected: true,
        zIndex: -100,
        dragHandle: ".summary-area-header",
        data: { recipe: summaryRecipe, machines: 0, variants: {} },
      },
    ]);
    markDirty();
  }
  const recipeBounds = nodes
    .filter((node) => node.type !== "summary")
    .map((node) => ({
      position: node.position,
      width: node.measured?.width ?? 340,
      height: node.measured?.height ?? 240,
      ...node.data,
    }));
  const renderedNodes = nodes.map((node) =>
    node.type === "summary"
      ? {
          ...node,
          data: {
            ...node.data,
            summary: summarizeArea(
              {
                position: node.position,
                width: node.width ?? 640,
                height: node.height ?? 480,
              },
              recipeBounds,
            ),
            removeArea: context.remove,
            updateCalculators: (calculators: SummaryCalculation[]) => {
              setNodes((values) =>
                values.map((value) =>
                  value.id === node.id
                    ? { ...value, data: { ...value.data, calculators } }
                    : value,
                ),
              );
              markDirty();
            },
          },
        }
      : node,
  );
  const menuAction = (action: "copy" | "cut" | "paste") => {
    setSelectionMenu(null);
    if (action === "copy" || action === "cut") {
      const copied = copySelection({ nodes, edges });
      if (!copied.nodes.length) return;
      const text = JSON.stringify({
        type: "resource-planner-selection",
        id: crypto.randomUUID(),
        ...copied,
      });
      clipboard.current = { ...copied, text };
      void navigator.clipboard?.writeText(text).catch(() => {});
      if (action === "copy") return;
      const ids = new Set(copied.nodes.map((node) => node.id));
      setNodes((values) => values.filter((node) => !ids.has(node.id)));
      setEdges((values) =>
        values.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
      );
    } else {
      if (!clipboard.current?.nodes.length) return;
      const ids = new Set(
        nodes
          .filter((node) => selectionMenu?.onSelection && node.selected)
          .map((node) => node.id),
      );
      const pasted = pasteSelection(clipboard.current, insertionPoint(), () =>
        crypto.randomUUID(),
      );
      setNodes((values) => [
        ...values
          .filter((node) => !ids.has(node.id))
          .map((node) => ({ ...node, selected: false })),
        ...pasted.nodes,
      ]);
      setEdges((values) => [
        ...values
          .filter(
            (edge) =>
              !(selectionMenu?.onSelection && edge.selected) &&
              !ids.has(edge.source) &&
              !ids.has(edge.target),
          )
          .map((edge) => ({ ...edge, selected: false })),
        ...pasted.edges,
      ]);
    }
    markDirty();
  };
  return (
    <EditorContext.Provider value={context}>
      <main
        className="workspace"
        onPointerDownCapture={(event) => {
          if (event.button === 2)
            contextStart.current = { x: event.clientX, y: event.clientY };
          if (
            !(event.target instanceof Element) ||
            !event.target.closest(".diagram-selection-menu")
          )
            setSelectionMenu(null);
        }}
        onContextMenuCapture={(event) => {
          if (
            !(event.target instanceof Element) ||
            event.target.closest(
              "input,textarea,select,.react-flow__handle,button",
            )
          )
            return;
          if (!event.target.closest(".react-flow")) return;
          if (
            contextStart.current &&
            Math.hypot(
              event.clientX - contextStart.current.x,
              event.clientY - contextStart.current.y,
            ) > 5
          )
            return;
          const onSelection = !!event.target.closest(
            ".react-flow__node.selected,.react-flow__edge.selected,.connection-label.selected",
          );
          // Keep right-click bend insertion available on unselected lines.
          if (
            !onSelection &&
            event.target.closest(".react-flow__edge,.connection-label")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          setSelectionMenu({
            canPaste: !!clipboard.current?.nodes.length,
            onSelection,
            x: Math.max(0, Math.min(event.clientX, window.innerWidth - 180)),
            y: Math.max(0, Math.min(event.clientY, window.innerHeight - 230)),
          });
        }}
      >
        {selectionMenu && (
          <div
            className="diagram-selection-menu"
            role="menu"
            style={{ left: selectionMenu.x, top: selectionMenu.y }}
          >
            <button
              role="menuitem"
              disabled={selectionMenu.onSelection}
              onClick={() => {
                setSelectionMenu(null);
                setItemPicker(true);
              }}
            >
              Add item card
            </button>
            <button
              role="menuitem"
              disabled={selectionMenu.onSelection}
              onClick={() => {
                setSelectionMenu(null);
                addArea();
              }}
            >
              Add summary area
            </button>
            <div role="separator" className="diagram-menu-divider" />
            <button
              role="menuitem"
              disabled={!selectionMenu.onSelection}
              onClick={() => menuAction("copy")}
            >
              Copy
            </button>
            <button
              role="menuitem"
              disabled={!selectionMenu.onSelection}
              onClick={() => menuAction("cut")}
            >
              Cut
            </button>
            <button
              role="menuitem"
              disabled={!selectionMenu.canPaste}
              onClick={() => menuAction("paste")}
            >
              Paste
            </button>
          </div>
        )}
        <div className="workspace-body">
          <aside className="diagram-sidebar">
            <Link
              href="/games/gtnh"
              className="back"
              onClick={(e) => {
                if (
                  dirty &&
                  !window.confirm("Leave without saving this diagram?")
                )
                  e.preventDefault();
              }}
            >
              <ArrowLeft size={14} /> Projects
            </Link>
            <div className="sidebar-project">
              <img src="/assets/gtnh-2.8.4/logo.png" alt="GTNH" />
              <div>
                <strong>{project.name}</strong>
                <small>GTNH {project.version}</small>
              </div>
            </div>
            <div className="panel-heading">
              DIAGRAMS
              <button
                aria-label="Create diagram"
                onClick={() => {
                  setDiagramName("");
                  setDialog("create");
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <nav>
              {diagrams.map((d) => (
                <button
                  className={`diagram-link ${d.id === active ? "active" : ""}`}
                  key={d.id}
                  disabled={saving}
                  onClick={async () => {
                    if (d.id === active) return;
                    if (dirty && !(await save())) return;
                    await load(d.id);
                  }}
                >
                  <Workflow size={16} />
                  <span>{d.name}</span>
                </button>
              ))}
            </nav>
            <button
              className="new-diagram"
              onClick={() => {
                setDiagramName("");
                setDialog("create");
              }}
            >
              <Plus size={15} /> New diagram
            </button>
            <div className="sidebar-bottom">
              <div className="sidebar-save">
                <span className="save-state" role="status">
                  {saving
                    ? "Saving…"
                    : dirty
                      ? "Unsaved changes"
                      : "Saved locally"}
                </span>
                <button
                  onClick={() => void save()}
                  disabled={!ready || saving || !dirty}
                >
                  <Save size={15} /> Save
                </button>
              </div>
              <p className="sidebar-card-count">{nodes.length} cards</p>
              <p>Connect matching ports to calculate machine ratios.</p>
              <small>
                Ratios use base recipe times. Chance outputs show expected
                averages.
              </small>
            </div>
          </aside>
          <section className="editor">
            <DiagramActions
              ready={ready}
              canDelete={!!current && !saving}
              onJson={() =>
                download(
                  JSON.stringify(document(), null, 2),
                  `${current?.name}.json`,
                  "application/json",
                )
              }
              onSvg={() =>
                exportDiagram(
                  document(),
                  nodes.map((n) => n.data.recipe),
                  "svg",
                  current?.name ?? "diagram",
                ).catch((e) => setError(e.message))
              }
              onPdf={() =>
                exportDiagram(
                  document(),
                  nodes.map((n) => n.data.recipe),
                  "pdf",
                  current?.name ?? "diagram",
                ).catch((e) => setError(e.message))
              }
              onDelete={() => setDialog("delete")}
            />
            {error && (
              <div className="error error-banner" role="alert">
                {error}
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  ×
                </button>
              </div>
            )}
            <CanvasSelection
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              enabled={ready}
            >
              <ReactFlow<RecipeNode, DiagramEdge>
                nodes={renderedNodes}
                edges={renderedEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                elevateEdgesOnSelect={false}
                elevateNodesOnSelect={false}
                multiSelectionKeyCode={["Control", "Meta"]}
                onEdgeClick={(event, edge) =>
                  selectEdge(
                    edge.id,
                    event.ctrlKey || event.metaKey,
                    event.ctrlKey || event.metaKey,
                  )
                }
                snapToGrid
                panOnDrag={[1]}
                selectionKeyCode={null}
                selectionOnDrag={false}
                snapGrid={[GRID_SIZE, GRID_SIZE]}
                onInit={(instance) => {
                  flow.current = instance;
                }}
                onNodesChange={(changes) => {
                  if (!ready) return;
                  const movements = new Map<string, { x: number; y: number }>();
                  for (const change of changes) {
                    if (change.type !== "position" || !change.position)
                      continue;
                    const previous = nodes.find(
                      (node) => node.id === change.id,
                    )?.position;
                    if (
                      previous &&
                      (previous.x !== change.position.x ||
                        previous.y !== change.position.y)
                    )
                      movements.set(change.id, {
                        x: change.position.x - previous.x,
                        y: change.position.y - previous.y,
                      });
                  }
                  if (movements.size)
                    setEdges((values) => moveConnectedEdges(values, movements));
                  setNodes((ns) => applyNodeChanges(changes, ns));
                  const removed = changes
                    .filter((c) => c.type === "remove")
                    .map((c) => c.id);
                  if (removed.length)
                    setEdges((es) =>
                      es.filter(
                        (e) =>
                          !removed.includes(e.source) &&
                          !removed.includes(e.target),
                      ),
                    );
                  if (
                    changes.some(
                      (c) =>
                        c.type !== "select" &&
                        (c.type !== "dimensions" ||
                          (c.setAttributes &&
                            nodes.find((node) => node.id === c.id)?.type ===
                              "summary")),
                    )
                  )
                    markDirty();
                }}
                onEdgesChange={(changes) => {
                  if (!ready) return;
                  setEdges((es) => applyEdgeChanges(changes, es));
                  if (changes.some((c) => c.type !== "select")) markDirty();
                }}
                onConnect={(connection) => {
                  if (valid(connection)) {
                    const c = normalize(connection);
                    const output = port(
                      nodes.find((node) => node.id === c.source)!.data.recipe,
                      c.sourceHandle,
                    )!;
                    setNodes((ns) =>
                      ns.map((node) =>
                        node.id === c.target
                          ? {
                              ...node,
                              data: {
                                ...node.data,
                                variants: {
                                  ...node.data.variants,
                                  [c.targetHandle!]: output.itemId,
                                },
                              },
                            }
                          : node,
                      ),
                    );
                    setEdges((es) => [
                      ...es,
                      { ...normalize(connection), id: crypto.randomUUID() },
                    ]);
                    markDirty();
                  }
                }}
                isValidConnection={valid}
                connectionMode={ConnectionMode.Loose}
                onMoveEnd={(event) => {
                  if (ready && event) markDirty();
                }}
                minZoom={0.05}
                maxZoom={3}
                deleteKeyCode={
                  browser || dialog || itemPicker
                    ? null
                    : ["Backspace", "Delete"]
                }
                colorMode="dark"
              >
                <Panel position="top-center" className="diagram-create-tools">
                  <button
                    aria-label="Add item card"
                    title="Add item card — Choose an item or fluid to add as a source card that you can connect to recipe inputs."
                    disabled={!ready}
                    onClick={() => setItemPicker(true)}
                  >
                    <PackagePlus size={20} />
                  </button>
                  <button
                    aria-label="Add summary area"
                    title="Add summary area — Place and resize an area around recipes to see their combined energy use, machine counts, needed and produced resources, and add ratio calculators."
                    disabled={!ready}
                    onClick={addArea}
                  >
                    <SquareDashed size={20} />
                  </button>
                </Panel>
                <Panel position="top-left" className="diagram-history">
                  <button
                    aria-label="Undo"
                    title="Undo (Ctrl+Z)"
                    disabled={!canUndo || !ready}
                    onClick={() => {
                      undo();
                      markDirty();
                    }}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    aria-label="Redo"
                    title="Redo (Ctrl+Shift+Z)"
                    disabled={!canRedo || !ready}
                    onClick={() => {
                      redo();
                      markDirty();
                    }}
                  >
                    <Redo2 size={17} />
                  </button>
                </Panel>
                <Controls showInteractive={false} />
                <MiniMap nodeColor="#8baf8b" maskColor="rgba(15,20,18,.8)" />
              </ReactFlow>
              {!nodes.length && (
                <div className="canvas-empty">
                  <div className="empty-icon">
                    <Workflow size={34} />
                  </div>
                  <h2>
                    {diagrams.length
                      ? "Every factory starts with one recipe."
                      : "Make room for your next idea."}
                  </h2>
                  <p>
                    {diagrams.length
                      ? "Find an item in the catalog, choose a recipe, and add it to your diagram."
                      : "Create a diagram from the sidebar to get started."}
                  </p>
                  <div>
                    <span>01 Search an item</span>
                    <span>02 Choose a recipe</span>
                    <span>03 Connect machines</span>
                  </div>
                </div>
              )}
            </CanvasSelection>
            <footer className="canvas-footer">
              <span>
                Wheel-drag to pan · Drag to select · Shift+drag to deselect ·
                Scroll to zoom
              </span>
              <span>20 ticks / second · Producer : consumer</span>
            </footer>
          </section>
          <Inventory
            onBrowse={browse}
            onAddItem={(item) => addCard(itemSourceRecipe(item))}
          />
        </div>
        {itemPicker && (
          <div className="modal-backdrop" onClick={() => setItemPicker(false)}>
            <div
              className="dialog item-picker-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Choose an item card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dialog-heading">
                <h2>Add item card</h2>
                <button
                  aria-label="Close item picker"
                  onClick={() => setItemPicker(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <Inventory
                picker
                onBrowse={(item, mode) => {
                  if (mode === "recipes") {
                    addCard(itemSourceRecipe(item));
                    setItemPicker(false);
                  }
                }}
                onAddItem={(item) => {
                  addCard(itemSourceRecipe(item));
                  setItemPicker(false);
                }}
              />
            </div>
          </div>
        )}
        {dialog && (
          <div className="modal-backdrop">
            <form
              className="dialog"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  if (dialog === "create") {
                    if (dirty && !(await save())) return;
                    const d = await api<{ id: string; name: string }>(
                      "/api/diagrams",
                      {
                        method: "POST",
                        body: JSON.stringify({
                          projectId: project.id,
                          name: diagramName,
                        }),
                      },
                    );
                    setDiagrams((ds) => [...ds, d]);
                    await load(d.id);
                  } else if (current) {
                    await api(`/api/diagrams/${current.id}`, {
                      method: "DELETE",
                    });
                    const remaining = diagrams.filter(
                      (d) => d.id !== current.id,
                    );
                    setDiagrams(remaining);
                    dirtyRef.current = false;
                    setDirty(false);
                    if (remaining[0]) await load(remaining[0].id);
                    else {
                      setActive("");
                      setNodes([]);
                      setEdges([]);
                      setReady(false);
                      window.history.replaceState(
                        null,
                        "",
                        window.location.pathname,
                      );
                    }
                  }
                  setDialog(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>
                {dialog === "create"
                  ? "Create diagram"
                  : `Delete “${current?.name}”?`}
              </h2>
              {dialog === "create" ? (
                <label>
                  Diagram name
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    value={diagramName}
                    onChange={(e) => setDiagramName(e.target.value)}
                    placeholder="Steel production"
                  />
                </label>
              ) : (
                <p>
                  This removes the diagram from your project. Download a JSON
                  copy first if you want to keep it.
                </p>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  className={dialog === "delete" ? "danger" : "primary"}
                >
                  {busy
                    ? "Working…"
                    : dialog === "create"
                      ? "Create diagram"
                      : "Delete diagram"}
                </button>
              </div>
            </form>
          </div>
        )}
        {browser && (
          <div className="modal-backdrop" onClick={() => setBrowser(null)}>
            <div
              className="recipe-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Recipe browser"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="recipe-browser-heading">
                <button
                  aria-label="Previous item"
                  disabled={!history.length}
                  onClick={() => {
                    const previous = history[history.length - 1];
                    if (previous) {
                      void browse(previous.item, previous.mode);
                      setHistory(history.slice(0, -1));
                    }
                  }}
                >
                  <ArrowLeft size={17} />
                </button>
                <div>
                  <small>
                    {browser.mode === "recipes" ? "RECIPES FOR" : "USED IN"}
                  </small>
                  <h2>{browser.item.name}</h2>
                </div>
                <button
                  aria-label="Close recipes"
                  onClick={() => setBrowser(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="browser-mode">
                <button
                  className={browser.mode === "recipes" ? "active" : ""}
                  onClick={() => browse(browser.item, "recipes")}
                >
                  Recipes
                </button>
                <button
                  className={browser.mode === "uses" ? "active" : ""}
                  onClick={() => browse(browser.item, "uses")}
                >
                  Uses
                </button>
              </div>
              <div
                className={`recipe-browser-content${selectedRecipe?.craftingMachines?.length ? " has-machines" : ""}`}
                ref={recipeContent}
              >
                <div className="recipe-tab-bar" ref={recipeTabBar}>
                  <button
                    className="recipe-tab-scroll"
                    hidden={!tabsOverflow}
                    aria-label="Scroll recipe tabs left"
                    onClick={() =>
                      recipeTabs.current?.scrollBy({
                        left: -153,
                        behavior: "smooth",
                      })
                    }
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div
                    ref={recipeTabs}
                    className="recipe-tabs"
                    role="tablist"
                    aria-label="Recipe machines and crafting methods"
                  >
                    {[...new Set(recipes.map((r) => r.handler))].map(
                      (h, index) => (
                        <button
                          className={h === handler ? "active" : ""}
                          key={h}
                          id={`recipe-handler-tab-${index}`}
                          role="tab"
                          aria-label={h}
                          title={h}
                          aria-selected={h === handler}
                          aria-controls="recipe-handler-panel"
                          tabIndex={h === handler ? 0 : -1}
                          onFocus={(event) =>
                            event.currentTarget.scrollIntoView({
                              block: "nearest",
                              inline: "nearest",
                            })
                          }
                          onKeyDown={(event) => {
                            const tabs = Array.from(
                              event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                                '[role="tab"]',
                              ),
                            );
                            const target =
                              event.key === "ArrowRight"
                                ? (index + 1) % tabs.length
                                : event.key === "ArrowLeft"
                                  ? (index - 1 + tabs.length) % tabs.length
                                  : event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? tabs.length - 1
                                      : -1;
                            if (target >= 0) {
                              event.preventDefault();
                              tabs[target].focus();
                              tabs[target].click();
                            }
                          }}
                          onClick={() => {
                            setHandler(h);
                            setRecipePage(0);
                          }}
                        >
                          <img
                            src={
                              recipeTabIcon(
                                recipes.find((recipe) => recipe.handler === h)!,
                              ) ??
                              browser.item.image ??
                              undefined
                            }
                            alt=""
                            draggable={false}
                          />
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    className="recipe-tab-scroll"
                    hidden={!tabsOverflow}
                    aria-label="Scroll recipe tabs right"
                    onClick={() =>
                      recipeTabs.current?.scrollBy({
                        left: 153,
                        behavior: "smooth",
                      })
                    }
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div
                  className="recipe-handler-panel"
                  id="recipe-handler-panel"
                  role="tabpanel"
                  aria-labelledby={`recipe-handler-tab-${[...new Set(recipes.map((recipe) => recipe.handler))].indexOf(handler)}`}
                >
                  {recipeLoading ? (
                    <p className="recipe-message">Looking up recipes…</p>
                  ) : selectedRecipe ? (
                    <CyclingRecipe
                      key={selectedRecipe.id}
                      recipe={selectedRecipe}
                      pager={
                        <div className="recipe-pager">
                          <button
                            className="recipe-tab-scroll"
                            disabled={!recipePage}
                            aria-label="Previous recipe"
                            onClick={() => setRecipePage(recipePage - 1)}
                          >
                            <ChevronLeft size={17} />
                          </button>
                          <span>
                            Page {filtered.length ? recipePage + 1 : 0}/
                            {filtered.length}
                          </span>
                          <button
                            className="recipe-tab-scroll"
                            disabled={recipePage >= filtered.length - 1}
                            aria-label="Next recipe"
                            onClick={() => setRecipePage(recipePage + 1)}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </div>
                      }
                      onBrowse={browse}
                      onSelect={addRecipe}
                      disabled={!ready}
                    />
                  ) : (
                    <p className="recipe-message">
                      No enabled {browser.mode} in the imported catalog.
                    </p>
                  )}
                </div>
                {!!selectedRecipe?.craftingMachines?.length && (
                  <aside
                    className="recipe-machine-slots"
                    aria-label="Crafting machines"
                  >
                    {selectedRecipe.craftingMachines.map((machine) => (
                      <ItemSlot
                        key={machine.id}
                        nativeTooltip
                        item={machine}
                        onBrowse={browse}
                      />
                    ))}
                  </aside>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </EditorContext.Provider>
  );
}
