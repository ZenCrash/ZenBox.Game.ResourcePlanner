"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { DiagramTree } from "./diagram-tree";
import { ResizableSidebar } from "./resizable-sidebar";
import { DisplaySettingsProvider, DisplaySettingsPanel, useDisplaySettings } from "./display-settings";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,


  type CSSProperties,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Panel,
  MiniMap,
  ConnectionMode,
  applyEdgeChanges,


  type Edge,

  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Workflow,
  Undo2,
  Redo2,
  PackagePlus,
  SquareDashed,
  Settings,
  PanelLeftClose,
  Copy,
  Scissors,
  ClipboardPaste,
  RotateCcw,
  WandSparkles,
  Type,
} from "lucide-react";
import {
  blankDiagram,

  createPortColorResolver,
  portsCompatible,
  fluidReferenceCompatible,
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

  type Browse,
} from "./recipe-view";
import { GridEdge, type DiagramEdge } from "./grid-edge";
import { GRID_SIZE, snapPoint } from "@/lib/diagram-geometry";
import { initialRoute } from "@/lib/initial-route";
import { exportDiagram, download } from "@/lib/export";
import { connectionSummary } from "@/lib/connection-summary";
import { fluidReferenceFlow, fluidReferenceInputRates } from "@/lib/fluid-reference";
import { perfectMachineCounts, stepMachineRatio, catchupMachineCounts, availableCatchup } from "@/lib/perfect-ratio";

import type { PortRows } from "@/lib/port-layout";
import { useGraphHistory } from "./use-graph-history";
import { copySelection, pasteSelection } from "@/lib/editor-clipboard";
import { CanvasSelection } from "./canvas-selection";
import { GridBackground } from "./grid-background";
import { RecipeChevron } from "./recipe-chevron";
import { SummaryArea } from "./summary-area";
import { AutoRecipePlanner, type PlannedGraph } from "./auto-recipe-planner";

import { overclockRecipe } from "@/lib/recipe-overclock";
import { selectedMachine, machineOptions } from "@/lib/machine-selection";
import { ItemTooltip } from "./item-tooltip";
import { recipeCategoryMod } from "@/lib/recipe-handlers";
import { summarizeArea, summaryRecipe } from "@/lib/area-summary";
import type { SummaryCalculation } from "@/lib/summary-rate";
import { MachineCard, EditorContext, type RecipeNode } from "./machine-card";
import { DiagramLabel } from "./diagram-label";
const nodeTypes = { recipe: MachineCard, summary: SummaryArea, label: DiagramLabel };
const edgeTypes = { grid: GridEdge };
export function Workspace({ project }: { project: Project }) {
  return (
    <DisplaySettingsProvider><ReactFlowProvider>
      <Editor project={project} />
    </ReactFlowProvider></DisplaySettingsProvider>
  );
}
function Editor({ project }: { project: Project }) {
  const { settings } = useDisplaySettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemPicker, setItemPicker] = useState(false);
  const [autoPlanner, setAutoPlanner] = useState(false);
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    undo,
    redo,
    resetHistory,
    changeNodes,
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
  const selectionMenuElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = selectionMenuElement.current;
    if (!selectionMenu || !element) return;
    element.style.left = `${Math.max(8, Math.min(selectionMenu.x, window.innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(selectionMenu.y, window.innerHeight - element.offsetHeight - 8))}px`;
  }, [selectionMenu]);
  const recipeContent = useRef<HTMLDivElement>(null);
  const recipeTabBar = useRef<HTMLDivElement>(null);
  const [tabsPerSection, setTabsPerSection] = useState(Number.MAX_SAFE_INTEGER);
  const [tabSection, setTabSection] = useState(0);
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
      mode: "recipes" | "uses" | "category";
    } | null>(null),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [recipeLoading, setRecipeLoading] = useState(false),
    [handler, setHandler] = useState(""),
    [recipePage, setRecipePage] = useState(0),
    [history, setHistory] = useState<
      { item: Item; mode: "recipes" | "uses" | "category" }[]
    >([]);
  useEffect(() => {
    const strip = recipeTabs.current;
    const bar = recipeTabBar.current;
    if (!strip || !bar) return;
    const measure = () => {
      const count = new Set(recipes.map(recipe => recipe.handler)).size;
      const overflow = count * 51 + 3 > bar.clientWidth;
      setTabsPerSection(Math.max(1, Math.floor((bar.clientWidth - (overflow ? 40 : 0) - 3) / 51)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => observer.disconnect();
  }, [browser, recipes]);
  useEffect(() => {
    const handlers = [...new Set(recipes.map(recipe => recipe.handler))];
    setTabSection(Math.floor(Math.max(0, handlers.indexOf(handler)) / tabsPerSection));
  }, [handler, recipes, tabsPerSection]);
  useEffect(() => {
    const content = recipeContent.current;
    const card = content?.querySelector<HTMLElement>(".recipe-view");
    if (!content || !card) return;
    const measure = () => {
      const bounds = card.getBoundingClientRect();
      // Screen rectangles include CSS zoom; the strip uses local CSS pixels.
      const cardHeight = bounds.height / settings.guiScale;
      content.style.setProperty(
        "--machine-strip-top",
        `${(bounds.top - content.getBoundingClientRect().top) / settings.guiScale}px`,
      );
      content.style.setProperty("--machine-strip-height", `${cardHeight}px`);
      const machines = content.querySelector<HTMLElement>(
        ".recipe-machine-slots",
      );
      if (machines && machines.children.length) {
        const styles = getComputedStyle(machines);
        const gap = parseFloat(styles.rowGap) || 0;
        const verticalInset =
          parseFloat(styles.paddingTop) +
          parseFloat(styles.paddingBottom) +
          parseFloat(styles.borderTopWidth) +
          parseFloat(styles.borderBottomWidth);
        const slotHeight = (machines.firstElementChild as HTMLElement)
          .offsetHeight;
        const visibleRows = Math.max(
          1,
          Math.floor(
            (cardHeight - verticalInset + gap) / (slotHeight + gap),
          ),
        );
        const count = machines.children.length;
        const columns = Math.min(3, Math.ceil(count / visibleRows));
        const rows =
          count > visibleRows * 3
            ? Math.ceil(count / 3)
            : Math.min(count, visibleRows);
        machines.style.gridTemplateColumns = `repeat(${columns}, 32px)`;
        machines.style.gridTemplateRows = `repeat(${rows}, 32px)`;
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [browser, recipes, handler, recipePage, settings.guiScale]);
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
        .filter((n) => n.type === "recipe")
        .map((n) => ({
          id: n.id,
          recipeId: n.data.recipe.id,
          ...(n.data.recipe.sourceItemId
            ? { itemId: n.data.recipe.sourceItemId }
            : {}),
          machines: n.data.machines,
          machineId: n.data.machineId,
          ...(n.measured?.width && n.measured?.height
            ? { size: { width: n.measured.width, height: n.measured.height } }
            : {}),
          position: n.position,
          variants: n.data.variants,
          ...(n.data.portRows ? { portRows: n.data.portRows } : {}),
          ...(n.data.disabledPorts?.length ? { disabledPorts: n.data.disabledPorts } : {}),
        })),
      labels: nodes.filter(n => n.type === "label").map(n => ({ id: n.id, position: n.position, text: n.data.text ?? "Label", fontSize: n.data.fontSize ?? 30, textColor: n.data.textColor, backgroundColor: n.data.backgroundColor })),
      areas: nodes
        .filter((n) => n.type === "summary")
        .map((n) => ({
          id: n.id,
          position: n.position,
          width: n.width ?? 640,
          height: n.height ?? 480,
          calculators: n.data.calculators,
          title: n.data.title,
        })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle!,
        targetHandle: e.targetHandle!,
        showLineCard: e.data?.showLineCard,
        showOverviewCard: e.data?.showOverviewCard,
        ...(e.data?.reference ? { reference: true } : {}),
        ...(e.data?.bend ? { bend: e.data.bend } : {}),
        ...(e.data?.targetBendX !== undefined
          ? { targetBendX: e.data.targetBendX }
          : {}),
        ...(e.data?.waypoints ? { waypoints: e.data.waypoints } : {}),
        ...(e.data?.labelPosition
          ? { labelPosition: e.data.labelPosition }
          : {}),
        ...(e.data?.imagePosition
          ? { imagePosition: e.data.imagePosition }
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
              machines: Math.max(1, n.machines),
              machineId: n.machineId,
              variants: n.variants,
              portRows: n.portRows,
              disabledPorts: n.disabledPorts,
            },
          })),
          ...(doc.labels ?? []).map((label): RecipeNode => ({ id: label.id, type: "label", position: label.position, zIndex: 3500, data: { recipe: summaryRecipe, machines: 0, variants: {}, text: label.text, fontSize: label.fontSize, textColor: label.textColor, backgroundColor: label.backgroundColor } })),
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
              title: area.title,
            },
          })),
        ]);
        setEdges(
          doc.edges.map((edge) => ({
            ...edge,
            data: {
              reference: edge.reference,
              showLineCard: edge.showLineCard,
              showOverviewCard: edge.showOverviewCard,
              bend: edge.bend,
              targetBendX: edge.targetBendX,
              waypoints: edge.waypoints,
              labelPosition: edge.labelPosition,
              imagePosition: edge.imagePosition,
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
        browserEpoch.current++;
        setSelectionMenu(null);
        setItemPicker(false);
        setAutoPlanner(false);
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
        itemPicker || autoPlanner ||
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
        itemPicker || autoPlanner ||
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
    autoPlanner,
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
  const [recentItems, setRecentItems] = useState<Item[]>([]);
  const [availableModes, setAvailableModes] = useState({ recipes: false, uses: false });
  useEffect(() => {
    if (!browser || browser.mode === "category") return;
    let active = true;
    const otherMode = browser.mode === "recipes" ? "uses" : "recipes";
    void api<{ exists: boolean }>(`/api/recipes?item=${encodeURIComponent(browser.item.id)}&mode=${otherMode}&availability=1`)
      .then(({ exists }) => {
        if (active) setAvailableModes((modes) => ({ ...modes, [otherMode]: exists }));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [browser]);
  const browse = useCallback(
    async (item: Item, mode: Parameters<Browse>[1], selectedRecipeId?: string, back = false) => {
      const token = ++browserEpoch.current;
      try {
        const list = await api<Recipe[]>(
          `/api/recipes?item=${encodeURIComponent(item.id)}&mode=${mode}`,
        );
        if (token === browserEpoch.current && list.length) {
          if (mode !== "category") {
            setRecentItems((items) => [item, ...items.filter((recent) => recent.id !== item.id)].slice(0, 64));
          }
          setHistory((h) => back ? h.slice(0, -1) : browser ? [...h, browser] : h);
          setBrowser({ item, mode });
          setAvailableModes({ recipes: mode === "recipes", uses: mode === "uses" });
          setRecipes(list);
          const selected = list.find(
            (recipe) => recipe.id === selectedRecipeId,
          );
          const nextHandler = selected?.handler ?? list[0]?.handler ?? "";
          setHandler(nextHandler);
          setRecipePage(
            Math.max(
              0,
              list
                .filter((recipe) => recipe.handler === nextHandler)
                .findIndex((recipe) => recipe.id === selectedRecipeId),
            ),
          );
        }
      } catch (e) {
        if (token === browserEpoch.current) setError((e as Error).message);
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
      togglePort: (id: string, handle: string) => {
        if (edges.some((edge) =>
          (edge.source === id && edge.sourceHandle === handle) ||
          (edge.target === id && edge.targetHandle === handle))) return;
        setNodes((values) => values.map((node) => {
          if (node.id !== id) return node;
          const disabled = node.data.disabledPorts ?? [];
          return { ...node, data: { ...node.data, disabledPorts: disabled.includes(handle)
            ? disabled.filter((value) => value !== handle)
            : [...disabled, handle] } };
        }));
        markDirty();
      },
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
              ? {
                  ...edge,
                  data: {
                    ...edge.data,
                    labelPosition: undefined,
                    imagePosition: undefined,
                  },
                }
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
            n.id === id
              ? { ...n, data: { ...n.data, machines: Math.max(1, machines) } }
              : n,
          ),
        );
        markDirty();
      },
      selectMachine: (id: string, machineId: string) => {
        setNodes((ns) =>
          ns.map((node) =>
            node.id === id
              ? { ...node, data: { ...node.data, machineId } }
              : node,
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
    if (a.data.disabledPorts?.includes(c.sourceHandle ?? "") ||
        b.data.disabledPorts?.includes(c.targetHandle ?? "")) return false;
    const output = port(applyVariants(a.data.recipe, a.data.variants), c.sourceHandle),
      input = port(applyVariants(b.data.recipe, b.data.variants), c.targetHandle);
    return (
      !!output &&
      !!input &&
      hasIngredientPort(output) &&
      hasIngredientPort(input) &&
      output.direction === "output" &&
      input.direction === "input" &&
      (portsCompatible(output, input) || fluidReferenceCompatible(output, input)) &&
      !edges.some(
        (edge) =>
          edge.target === c.target &&
          edge.targetHandle === c.targetHandle &&
          !edge.data?.reference && !fluidReferenceCompatible(output, input) &&
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
  const runtimeRecipes = new Map(
    nodes.map((node) => [
      node.id,
      overclockRecipe(
        applyVariants(node.data.recipe, node.data.variants),
        node.data.machineId,
      ),
    ]),
  );
  const inputSupply = new Map<string, number>();
  const baseRatioCounts = (edge: Edge, allInputs: boolean, includeReferences = false) => {
    if (edge.data?.reference && !includeReferences) return null;
    const connections = allInputs ? edges.filter((value) => value.target === edge.target && (includeReferences || !value.data?.reference)) : [edge];
    const flows = connections.map((value) => {
      const producer = runtimeRecipes.get(value.source);
      const consumer = runtimeRecipes.get(value.target);
      const output = producer && port(producer, value.sourceHandle);
      const input = consumer && port(consumer, value.targetHandle);
      const referenceRates = value.data?.reference && producer && consumer && output && input
        ? fluidReferenceInputRates(output, producer, input, consumer) : undefined;
      return {
        source: value.source, input: value.targetHandle ?? "",
        supply: referenceRates ? referenceRates.supply : producer && output ? rate(output, producer) : NaN,
        demand: referenceRates ? referenceRates.demand : consumer && input ? rate(input, consumer) : NaN,
      };
    });
    return perfectMachineCounts(edge.target, flows);
  };
  const applyRatio = (edge: Edge, allInputs: boolean, includeReferences = false) => {
    const counts = baseRatioCounts(edge, allInputs, includeReferences);
    if (!counts) return;
    setNodes((values) => values.map((node) => counts[node.id] === undefined ? node : {
      ...node, data: { ...node.data, machines: counts[node.id] },
    }));
    markDirty();
  };
  const stepRatio = (edge: Edge, allInputs: boolean, step: -1 | 1, includeReferences = false) => {
    const base = baseRatioCounts(edge, allInputs, includeReferences);
    if (!base) return;
    setNodes((values) => {
      const counts = stepMachineRatio(base, Object.fromEntries(values.map((node) => [node.id, node.data.machines])), step);
      if (!counts) return values;
      return values.map((node) => counts[node.id] === undefined || counts[node.id] === node.data.machines ? node : {
        ...node, data: { ...node.data, machines: counts[node.id] },
      });
    });
    markDirty();
  };
  for (const edge of edges) {
    if (edge.data?.reference) continue;
    const source = nodes.find((node) => node.id === edge.source);
    const output =
      source && port(runtimeRecipes.get(source.id)!, edge.sourceHandle);
    const key = `${edge.target}/${edge.targetHandle}`;
    const supplied =
      source && output && hasRecipeTiming(runtimeRecipes.get(source.id)!)
        ? rate(output, runtimeRecipes.get(source.id)!, source.data.machines)
        : NaN;
    inputSupply.set(key, (inputSupply.get(key) ?? 0) + supplied);
  }
  const renderedEdges = edges.map((savedEdge) => {
    // Info lines stay above production lines, including selected ones.
    // Cards and port circles remain above both line layers.
    const edge = { ...savedEdge, zIndex: savedEdge.data?.reference
      ? savedEdge.selected ? 2200 : 2100
      : savedEdge.selected ? 2000 : 0 };
    const source = nodes.find((n) => n.id === edge.source),
      target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) return edge;
    const sourceRecipe = runtimeRecipes.get(source.id)!,
      targetRecipe = runtimeRecipes.get(target.id)!;
    const output = port(sourceRecipe, edge.sourceHandle),
      input = port(targetRecipe, edge.targetHandle);
    if (!output || !input) return edge;
    const referenceFlow = edge.data?.reference ? fluidReferenceFlow(output, sourceRecipe, source.data.machines, input, targetRecipe, target.data.machines) : undefined;
    const lineColor = referenceFlow ? referenceFlow.color : hasRecipeTiming(targetRecipe)
          ? supplyColor(
              inputSupply.get(`${edge.target}/${edge.targetHandle}`) ?? NaN,
              rate(input, targetRecipe, target.data.machines),
            )
          : connectionColors.unrated;
    const catchup = edge.data?.reference ? null : availableCatchup(catchupMachineCounts(rate(output, sourceRecipe), rate(input, targetRecipe), source.data.machines, target.data.machines), lineColor);
    const summary = connectionSummary(
      output,
      sourceRecipe,
      source.data.machines,
      input,
      targetRecipe,
      target.data.machines,
    );
    return {
      ...edge,
      type: "grid",
      data: {
        ...edge.data,
        item: output.item,
        catchup,
        applyCatchup: (side: "a" | "b") => {
          const count = catchup?.[side];
          if (count == null) return;
          const nodeId = side === "a" ? source.id : target.id;
          setNodes((values) => values.map((node) => node.id === nodeId ? {
            ...node, data: { ...node.data, machines: count },
          } : node));
          markDirty();
        },
        perfectRatio: () => applyRatio(edge, false),
        stepRatio: (allInputs: boolean, step: -1 | 1, includeReferences = false) => stepRatio(edge, allInputs, step, includeReferences),
        hasInfoConnections: edges.some((value) => value.target === edge.target && value.data?.reference),
        infoBaseRatio: () => applyRatio(edge, false, true),
        canInfoBaseRatio: !!baseRatioCounts(edge, false, true),
        canInfoInputRatio: !!baseRatioCounts(edge, true, true),
        canStepConnectedRatio: !!baseRatioCounts(edge, true),
        baseInputRatio: () => applyRatio(edge, true),
        canPerfectRatio: !!baseRatioCounts(edge, false),
        canBaseInputRatio: !!baseRatioCounts(edge, true),
        hasOtherSuppliers: !edge.data?.reference && edges.some((value) => value.target === edge.target && value.source !== edge.source && !value.data?.reference),
        select: (additive: boolean, toggle?: boolean) =>
          selectEdge(edge.id, additive, toggle, true),
        setCardVisible: (overview: boolean, visible: boolean) => {
          setEdges(values => values.map(value => value.id === edge.id ? { ...value, data: { ...value.data, [overview ? "showOverviewCard" : "showLineCard"]: visible } } : value));
          markDirty();
        },
        moveLabel: (
          id: string,
          labelPosition: { x: number; y: number },
          image = false,
        ) => {
          setEdges((values) =>
            values.map((value) =>
              value.id === id
                ? {
                    ...value,
                    selected: true,
                    data: {
                      ...value.data,
                      [image ? "imagePosition" : "labelPosition"]:
                        labelPosition,
                    },
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
                      imagePosition: undefined,
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
                      imagePosition: undefined,
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
        stroke: lineColor,
        strokeWidth: settings.lineThickness,
      },
      label: (
        <>
          <div className="connection-card-heading">
            <span
              className={`connection-card-image${output.item.kind === "fluid" ? " fluid" : ""}`}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <ItemSlot item={output.item} onBrowse={browse} tooltipAtPointer />
            </span>
            <div className="connection-card-heading-text">
              <strong className="connection-item">{summary.item}</strong>
              <div className="connection-ratio">{edge.data?.reference ? referenceFlow?.liters
                ? `1 container = ${referenceFlow.liters.toLocaleString("en-US")} L` : "Fluid / container reference" : summary.ratio}</div>
            </div>
          </div>
          {edge.data?.reference ? <>
            <div className="connection-rates">
              <strong>{referenceFlow?.supplied === undefined ? "Unspecified" : `${referenceFlow.supplied.toLocaleString("en-US", { maximumFractionDigits: 3 })} L/s`}</strong>
              <span aria-label="to">→</span>
              <strong>{referenceFlow?.needed === undefined ? "Unspecified" : `${referenceFlow.needed.toLocaleString("en-US", { maximumFractionDigits: 3 })} L/s`}</strong>
            </div>
            <div className="connection-reference-note">{input.item.name.replace(/§./g, "")} · excluded from flow calculations</div>
          </> : <div className="connection-rates">
            <strong>{summary.from}</strong>
            <span aria-label="to">→</span>
            <strong>{summary.target}</strong>
          </div>}
        </>
      ),
      labelStyle: { fill: "#e7e7e5", fontSize: 11 },
      labelBgStyle: { fill: "#282828" },
      labelBgPadding: [9, 6] as [number, number],
    };
  });
  const current = diagrams.find((d) => d.id === active),
    filtered = recipes.filter((r) => r.handler === handler),
    selectedRecipe = filtered[recipePage];
  const recipeHandlers = [...new Set(recipes.map((recipe) => recipe.handler))];
  const scrollRecipeTabs = (direction: number) => {
    const sections = Math.max(1, Math.ceil(recipeHandlers.length / tabsPerSection));
    setTabSection(section => (section + direction + sections) % sections);
  };
  const changeRecipeTab = (step: number) => {
    if (!recipeHandlers.length) return;
    const index = (recipeHandlers.indexOf(handler) + step + recipeHandlers.length) % recipeHandlers.length;
    setHandler(recipeHandlers[index]);
    setRecipePage(0);
  };
  const changeRecipePage = (step: number) => {
    if (filtered.length) setRecipePage((page) => (page + step + filtered.length) % filtered.length);
  };
  const draggedCatalogItem = useRef<Item | null>(null);
  const [catalogDragPreview, setCatalogDragPreview] = useState<{ item: Item; x: number; y: number; zoom: number } | null>(null);
  useEffect(() => {
    const move = (event: DragEvent) => {
      const item = draggedCatalogItem.current;
      if (!item) return;
      if (event.target instanceof Element && event.target.closest(".inventory")) {
        setCatalogDragPreview(null);
        return;
      }
      setCatalogDragPreview({ item, x: event.clientX, y: event.clientY, zoom: flow.current?.getZoom() ?? 1 });
    };
    const hide = () => setCatalogDragPreview(null);
    const leave = (event: DragEvent) => { if (!event.relatedTarget) hide(); };
    window.addEventListener("dragover", move);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragend", hide);
    window.addEventListener("drop", hide);
    return () => {
      window.removeEventListener("dragover", move);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragend", hide);
      window.removeEventListener("drop", hide);
    };
  }, []);
  function addCard(
    recipe: Recipe,
    variants: VariantSelection = {},
    keepOpen = false,
    dropPosition?: { x: number; y: number },
  ) {
    if (!ready) {
      setError("Create or open a diagram before adding a card.");
      return;
    }
    const origin = dropPosition ?? insertionPoint();
    const id = crypto.randomUUID();
    setNodes((ns) => {
      const position = snapPoint(origin);
      const occupied = new Set(
        ns
          .filter((node) => node.type === "recipe")
          .map((node) => `${node.position.x},${node.position.y}`),
      );
      while (occupied.has(`${position.x},${position.y}`)) {
        position.x += GRID_SIZE * 2;
        position.y += GRID_SIZE * 2;
      }
      return [
        ...ns.map((node) => ({ ...node, selected: false })),
        {
          id,
          type: "recipe",
          selected: true,
          position,
          data: { recipe, machines: 1, variants },
        },
      ];
    });
    setEdges((values) => values.map((edge) => ({ ...edge, selected: false })));
    markDirty();
    if (!keepOpen) { browserEpoch.current++; setBrowser(null); }
  }
  function addRecipe(variants: VariantSelection, keepOpen: boolean) {
    if (selectedRecipe) addCard(selectedRecipe, variants, keepOpen);
  }
  function addLabel() {
    if (!ready) return;
    setNodes(values => [...values.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: "label", position: insertionPoint(), selected: true, zIndex: 3500, data: { recipe: summaryRecipe, machines: 0, variants: {}, text: "Label", fontSize: 30, textColor: "#ffffff", backgroundColor: "transparent" } }]);
    markDirty();
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
  function addPlannedGraph(graph: PlannedGraph) {
    if (!ready) return;
    const origin = insertionPoint();
    // Insert below existing cards so a complete route never lands on a recipe.
    if (nodes.length) origin.y = Math.max(origin.y, ...nodes.map((node) => node.position.y + (node.measured?.height ?? node.height ?? 480) + 160));
    const pasted = pasteSelection(graph, origin, () => crypto.randomUUID());
    setNodes((values) => [...values.map((node) => ({ ...node, selected: false })), ...pasted.nodes]);
    setEdges((values) => [...values.map((edge) => ({ ...edge, selected: false })), ...pasted.edges as DiagramEdge[]]);
    markDirty();
    setAutoPlanner(false);
    requestAnimationFrame(() => void flow.current?.fitView({ nodes: pasted.nodes.map(({ id }) => ({ id })), padding: 0.15, duration: 300 }));
  }
  const recipeBounds = nodes
    .filter((node) => node.type === "recipe")
    .map((node) => ({
      position: node.position,
      width: node.measured?.width ?? 340,
      height: node.measured?.height ?? 240,
      ...node.data,
    }));
  const renderedNodes = nodes.map((node) =>
    node.type === "label" ? { ...node, data: { ...node.data, removeLabel: () => context.remove(node.id), updateLabel: (patch: { text?: string; fontSize?: number; textColor?: string; backgroundColor?: string }) => { setNodes(values => values.map(value => value.id === node.id ? { ...value, data: { ...value.data, ...patch } } : value)); markDirty(); } } } :
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
            itemPortState: (itemId: string) => {
              let hasEnabled = false;
              let hasDisabled = false;
              for (const value of recipeBounds) {
                if (value.recipe.sourceItemId ||
                    value.position.x < node.position.x || value.position.y < node.position.y ||
                    value.position.x + value.width > node.position.x + (node.width ?? 640) ||
                    value.position.y + value.height > node.position.y + (node.height ?? 480)) continue;
                for (const ingredient of applyVariants(value.recipe, value.variants).ingredients) {
                  if (ingredient.itemId !== itemId || !hasIngredientPort(ingredient)) continue;
                  if (value.disabledPorts?.includes(`${ingredient.direction}:${ingredient.slot}`)) hasDisabled = true;
                  else hasEnabled = true;
                }
              }
              return { hasEnabled, hasDisabled };
            },
            setItemDisabled: (itemId: string, disabled: boolean) => {
              const affected = new Map<string, Set<string>>();
              const updated = nodes.map(value => {
                if (value.type !== "recipe" || value.data.recipe.sourceItemId ||
                    value.position.x < node.position.x || value.position.y < node.position.y ||
                    value.position.x + (value.measured?.width ?? 340) > node.position.x + (node.width ?? 640) ||
                    value.position.y + (value.measured?.height ?? 240) > node.position.y + (node.height ?? 480)) return value;
                const handles = new Set(applyVariants(value.data.recipe, value.data.variants).ingredients
                  .filter(i => i.itemId === itemId && hasIngredientPort(i)).map(i => `${i.direction}:${i.slot}`));
                if (!handles.size) return value;
                affected.set(value.id, handles);
                const ports = new Set(value.data.disabledPorts ?? []);
                handles.forEach(handle => disabled ? ports.add(handle) : ports.delete(handle));
                return { ...value, data: { ...value.data, disabledPorts: [...ports] } };
              });
              setNodes(updated);
              if (disabled) setEdges(values => values.filter(edge => !affected.get(edge.source)?.has(edge.sourceHandle ?? "") && !affected.get(edge.target)?.has(edge.targetHandle ?? "")));
              markDirty();
            },
            removeArea: context.remove,
            updateTitle: (title: string) => {
              setNodes((values) => values.map((value) =>
                value.id === node.id
                  ? { ...value, data: { ...value.data, title } }
                  : value,
              ));
              markDirty();
            },
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
      : { ...node, zIndex: 2500 },
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
  const selectedRecipeNodes = nodes.filter((node) => node.selected && node.type === "recipe");
  const canResetAmount = selectedRecipeNodes.some((node) => node.data.machines !== 1);
  const canResetTier = selectedRecipeNodes.some((node) =>
    selectedMachine(node.data.recipe, node.data.machineId)?.id !== machineOptions(node.data.recipe).defaultMachine?.id,
  );
  return (
    <EditorContext.Provider value={context}>
      {catalogDragPreview && createPortal(
        <div className="catalog-drag-preview" aria-hidden="true" style={{ left: catalogDragPreview.x, top: catalogDragPreview.y, transform: `scale(${catalogDragPreview.zoom})` }}>
          <div className="machine-card">
            <div className="recipe-view item-source-card">
              <div className="recipe-title">Item source</div>
              <div className="item-source-content">
                <ItemSlot item={catalogDragPreview.item} />
                <span>{catalogDragPreview.item.name}</span>
              </div>
            </div>
          </div>
        </div>, window.document.body,
      )}
      <main
        className="workspace"
        style={{ "--gui-scale": settings.guiScale } as CSSProperties}
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
              "input,textarea,select,.react-flow__handle,button,.summary-flow-item",
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
          const recipeNodeId = event.target.closest(".react-flow__node")?.getAttribute("data-id");
          const clickedRecipe = nodes.find((node) => node.id === recipeNodeId && node.type === "recipe");
          const onSelection = !!clickedRecipe || !!event.target.closest(
            ".react-flow__node.selected,.react-flow__edge.selected,.connection-label.selected",
          );
          // Lines have their own context menu, including when selected.
          if (
            event.target.closest(".react-flow__edge,.connection-label,.connection-overview-item")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          if (clickedRecipe && !clickedRecipe.selected) {
            setNodes((values) => values.map((node) => ({ ...node, selected: node.id === clickedRecipe.id })));
            setEdges((values) => values.map((edge) => ({ ...edge, selected: false })));
          }
          setSelectionMenu({
            canPaste: !!clipboard.current?.nodes.length,
            onSelection,
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        {selectionMenu && (
          <div
            ref={selectionMenuElement}
            className="diagram-selection-menu recipe-selection-menu"
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
              <PackagePlus size={16} aria-hidden="true" /> Add item card
            </button>
            <button
              role="menuitem"
              disabled={selectionMenu.onSelection}
              onClick={() => {
                setSelectionMenu(null);
                addArea();
              }}
            >
              <SquareDashed size={16} aria-hidden="true" /> Add grouping
            </button>
            <div role="separator" className="diagram-menu-divider" />
            <button
              role="menuitem"
              disabled={!selectionMenu.onSelection}
              onClick={() => menuAction("copy")}
            >
              <Copy size={16} aria-hidden="true" /> Copy
            </button>
            <button
              role="menuitem"
              disabled={!selectionMenu.onSelection}
              onClick={() => menuAction("cut")}
            >
              <Scissors size={16} aria-hidden="true" /> Cut
            </button>
            <button
              role="menuitem"
              disabled={!selectionMenu.canPaste}
              onClick={() => menuAction("paste")}
            >
              <ClipboardPaste size={16} aria-hidden="true" /> Paste
            </button>
            {selectionMenu.onSelection && selectedRecipeNodes.length > 0 && <>
              <div role="separator" className="diagram-menu-divider" />
              <button role="menuitem" type="button" disabled={!canResetAmount} onClick={() => {
                setNodes((values) => values.map((node) => node.selected && node.type === "recipe" && node.data.machines !== 1
                  ? { ...node, data: { ...node.data, machines: 1 } } : node));
                markDirty();
                setSelectionMenu(null);
              }}>
                <RotateCcw size={16} aria-hidden="true" /> Reset machine amount
                <ItemTooltip compact followPointer placement="top-right">
                  <strong>Reset machine amount</strong>
                  <span>Sets every selected recipe to one machine.</span>
                </ItemTooltip>
              </button>
              <button role="menuitem" type="button" disabled={!canResetTier} onClick={() => {
                setNodes((values) => values.map((node) => node.selected && node.type === "recipe" && node.data.machineId !== undefined
                  ? { ...node, data: { ...node.data, machineId: undefined } } : node));
                markDirty();
                setSelectionMenu(null);
              }}>
                <RotateCcw size={16} aria-hidden="true" /> Reset machine tier
                <ItemTooltip compact followPointer placement="top-right">
                  <strong>Reset machine tier</strong>
                  <span>Restores the default machine for every selected recipe.</span>
                </ItemTooltip>
              </button>
            </>}
          </div>
        )}
        <div className="workspace-body">
          <ResizableSidebar side="left" defaultWidth={225}>{(collapse) => <aside className="diagram-sidebar">
            <div className="sidebar-projects-header">
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
              <div className="sidebar-header-actions">
                <button type="button" aria-label="Settings" title="Settings" aria-pressed={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings size={18} /></button>
                <button type="button" aria-label="Collapse left sidebar" title="Collapse left sidebar" onClick={collapse}><PanelLeftClose size={18} /></button>
              </div>
            </div>
            {settingsOpen ? <DisplaySettingsPanel /> : <>
            <div className="sidebar-project">
              <img src="/assets/gtnh-2.8.4/logo.png" alt="GTNH" />
              <div>
                <strong>{project.name}</strong>
                <small>GTNH {project.version}</small>
              </div>
            </div>
            <DiagramTree projectId={project.id} diagrams={diagrams} active={active} disabled={saving}
              onCreate={() => { setDiagramName(""); setDialog("create"); }}
              onRename={diagram => setDiagrams(ds => ds.map(d => d.id === diagram.id ? { ...d, name: diagram.name } : d))}
              onOpen={async id => { if (id === active) return; if (dirty && !(await save())) return; await load(id); }} />
            </>}
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
          </aside>}</ResizableSidebar>
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
                onDragOver={(event) => {
                  if (!ready || !draggedCatalogItem.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                  const item = draggedCatalogItem.current;
                  if (!ready || !item || !flow.current) return;
                  event.preventDefault();
                  event.stopPropagation();
                  draggedCatalogItem.current = null;
                  setCatalogDragPreview(null);
                  addCard(itemSourceRecipe(item), {}, false, flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
                }}
                nodes={renderedNodes}
                edges={renderedEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                zIndexMode="manual"
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
                  changeNodes(changes);
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
                    const targetRecipe = nodes.find((node) => node.id === c.target)!.data.recipe;
                    const reference = fluidReferenceCompatible(output, port(applyVariants(targetRecipe, nodes.find((node) => node.id === c.target)!.data.variants), c.targetHandle)!);
                    if (!reference) setNodes((ns) =>
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
                    const sourceNode = flow.current?.getInternalNode(c.source);
                    const targetNode = flow.current?.getInternalNode(c.target);
                    const sourceHandle =
                      sourceNode?.internals.handleBounds?.source?.find(
                        (handle) => handle.id === c.sourceHandle,
                      );
                    const targetHandle =
                      targetNode?.internals.handleBounds?.target?.find(
                        (handle) => handle.id === c.targetHandle,
                      );
                    let waypoints: ReturnType<typeof initialRoute>;
                    if (
                      sourceNode &&
                      targetNode &&
                      sourceHandle &&
                      targetHandle
                    ) {
                      const start = {
                        x:
                          sourceNode.internals.positionAbsolute.x +
                          sourceHandle.x +
                          sourceHandle.width / 2,
                        y:
                          sourceNode.internals.positionAbsolute.y +
                          sourceHandle.y +
                          sourceHandle.height / 2,
                      };
                      const end = {
                        x:
                          targetNode.internals.positionAbsolute.x +
                          targetHandle.x + targetHandle.width / 2,
                        y:
                          targetNode.internals.positionAbsolute.y +
                          targetHandle.y +
                          targetHandle.height / 2,
                      };
                      const cards = nodes
                        .filter((node) => node.type === "recipe")
                        .flatMap((node) => {
                          const internal = flow.current?.getInternalNode(
                            node.id,
                          );
                          return internal
                            ? [
                                {
                                  id: node.id,
                                  ...internal.internals.positionAbsolute,
                                  width: internal.measured.width ?? 352,
                                  height: internal.measured.height ?? 200,
                                },
                              ]
                            : [];
                        });
                      waypoints =
                        initialRoute(start, end, c.source, c.target, cards) ??
                        initialRoute(start, end, c.source, c.target, cards, 0);
                    }
                    setEdges((es) => [
                      ...es,
                      { ...c, id: crypto.randomUUID(), data: { waypoints, reference } },
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
                  browser || dialog || itemPicker || autoPlanner
                    ? null
                    : ["Backspace", "Delete"]
                }
                colorMode="dark"
              >
                <GridBackground />
                <Panel position="top-center" className="diagram-create-tools">
                  <button
                    aria-label="Add item card"
                    title="Add item card — Choose an item or fluid to add as a source card that you can connect to recipe inputs."
                    disabled={!ready}
                    onClick={() => setItemPicker(true)}
                  >
                    <PackagePlus size={20} />
                  </button>
                  <button aria-label="Auto Recipe Planner" title="Auto Recipe Planner — Find and compare routes from an input item to a target item." disabled={!ready} onClick={() => setAutoPlanner(true)}>
                    <WandSparkles size={20} />
                  </button>
                  <button aria-label="Add label" title="Add label — Editable text with a font-size dropdown." disabled={!ready} onClick={addLabel}><Type size={20} /></button>
                  <button
                    aria-label="Add grouping"
                    title="Add grouping — Place and resize an area around recipes to see their combined energy use, machine counts, needed and produced resources, and add ratio calculators."
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
                <MiniMap nodeColor="#a3a3a3" maskColor="rgba(18,18,18,.8)" />
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
          <ResizableSidebar side="right" defaultWidth={318}>{(collapse) => <Inventory
            onCollapse={collapse}
            areaSummaries={
              <>
                {renderedNodes.filter((node) => node.type === "summary").map((node, index) => {
                  const summary = "summary" in node.data ? node.data.summary : undefined;
                  return (
                    <button key={node.id} className="sidebar-area-summary" onClick={() => {
                      setNodes((values) => values.map((value) => ({ ...value, selected: value.id === node.id })));
                      void flow.current?.fitView({ nodes: [{ id: node.id }], padding: 0.2, duration: 300 });
                    }}>
                      <strong>{node.data.title?.trim() || `Grouping ${index + 1}`}</strong>
                      {summary && <><span>{summary.recipeCount} recipes · {summary.machineCount.toLocaleString()} machines</span><span>{summary.euPerTick.toLocaleString()} EU/t</span></>}
                    </button>
                  );
                })}
                {!renderedNodes.some((node) => node.type === "summary") && <p>No groupings in this diagram yet.</p>}
              </>
            }
            recentItems={recentItems}
            onBrowse={browse}
            onAddItem={(item) => addCard(itemSourceRecipe(item))}
            onItemDragStart={ready ? (item, event) => {
              draggedCatalogItem.current = item;
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-resource-planner-item", item.id);
              // Render our own card preview instead of the browser's item-image ghost.
              const emptyDragImage = window.document.createElement("canvas");
              emptyDragImage.width = emptyDragImage.height = 1;
              event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
            } : undefined}
            onItemDragEnd={() => { draggedCatalogItem.current = null; setCatalogDragPreview(null); }}
          />}</ResizableSidebar>
        </div>
        {autoPlanner && <AutoRecipePlanner onClose={() => setAutoPlanner(false)} onAdd={addPlannedGraph} />}
        {itemPicker && (
          <div className="modal-backdrop" onClick={() => setItemPicker(false)}>
            <div
              className="dialog item-picker-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Choose an item card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="recipe-browser-heading item-picker-heading">
                <button type="button" aria-label="Previous item" disabled>
                  <ArrowLeft size={17} />
                </button>
                <div className="recipe-view">
                  <h2 className="recipe-title">
                    <span className="item-slot" aria-hidden="true"><PackagePlus size={24} /></span>
                    <span>Add item card</span>
                  </h2>
                </div>
                <button
                  aria-label="Close item picker"
                  onClick={() => setItemPicker(false)}
                >
                  <X size={20} />
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
          <div className="modal-backdrop recipe-browser-backdrop" onClick={() => { browserEpoch.current++; setBrowser(null); }}>
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
                      void browse(previous.item, previous.mode, undefined, true);
                    }
                  }}
                >
                  <ArrowLeft size={17} />
                </button>
                <div className="recipe-view">
                  <h2 className="recipe-title">
                    <ItemSlot item={browser.item} tooltipAtPointer />
                    <span>{browser.item.name}</span>
                  </h2>
                </div>
                <div className="recipe-header-actions">
                  <button
                      type="button"
                      className="primary recipe-header-add-item"
                      disabled={!ready}
                      onClick={() => addCard(itemSourceRecipe(browser.item))}
                      aria-label="Add item card to diagram"
                      title="Add item card to diagram"
                    >
                      <PackagePlus size={20} aria-hidden="true" />
                  </button>
                <button
                  className="recipe-header-close"
                  aria-label="Close recipes"
                  onClick={() => { browserEpoch.current++; setBrowser(null); }}
                >
                  <X size={20} />
                </button>
                </div>
              </div>
              <div
                className="browser-mode"
                hidden={browser.mode === "category"}
              >
                <button
                  className="recipe-nav-button"
                  disabled={browser.mode === "recipes" || !availableModes.recipes}
                  onClick={() => browse(browser.item, "recipes")}
                >
                  Recipes
                </button>
                <button
                  className="recipe-nav-button"
                  disabled={browser.mode === "uses" || !availableModes.uses}
                  onClick={() => browse(browser.item, "uses")}
                >
                  Ussage
                </button>
              </div>
              <div
                className={`recipe-browser-content${selectedRecipe?.craftingMachines?.length ? " has-machines" : ""}`}
                ref={recipeContent}
              >
                <div className="recipe-tab-bar" ref={recipeTabBar}>
                  <button
                    className="recipe-tab-scroll"
                    hidden={recipeHandlers.length <= tabsPerSection}
                    aria-label="Scroll recipe tabs left"
                    onClick={() => scrollRecipeTabs(-1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div
                    ref={recipeTabs}
                    className="recipe-tabs"
                    role="tablist"
                    aria-label="Recipe machines and crafting methods"
                  >
                    {recipeHandlers.map(
                      (h, index) => Math.floor(index / tabsPerSection) === tabSection && (
                        <button
                          className={h === handler ? "active" : ""}
                          key={h}
                          id={`recipe-handler-tab-${index}`}
                          role="tab"
                          aria-label={h}
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
                            const target =
                              event.key === "ArrowRight"
                                ? (index + 1) % recipeHandlers.length
                                : event.key === "ArrowLeft"
                                  ? (index - 1 + recipeHandlers.length) % recipeHandlers.length
                                  : event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? recipeHandlers.length - 1
                                      : -1;
                            if (target >= 0) {
                              event.preventDefault();
                              setHandler(recipeHandlers[target]);
                              setRecipePage(0);
                              setTabSection(Math.floor(target / tabsPerSection));
                              requestAnimationFrame(() => window.document.getElementById(`recipe-handler-tab-${target}`)?.focus());
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
                          <ItemTooltip compact tight followPointer placement="side-right">
                            <strong>{h}</strong>
                            <em>{recipeCategoryMod(recipes.find(recipe => recipe.handler === h)!)}</em>
                          </ItemTooltip>
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    className="recipe-tab-scroll"
                    hidden={recipeHandlers.length <= tabsPerSection}
                    aria-label="Scroll recipe tabs right"
                    onClick={() => scrollRecipeTabs(1)}
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
                      navigation={{
                        previous: (
                          <button
                            className="recipe-nav-button"
                            aria-label="Previous recipe tab"
                            disabled={recipeHandlers.length < 2}
                            onClick={() => changeRecipeTab(-1)}
                          >
                            <RecipeChevron direction="left" />
                          </button>
                        ),
                        next: (
                          <button
                            className="recipe-nav-button"
                            aria-label="Next recipe tab"
                            disabled={recipeHandlers.length < 2}
                            onClick={() => changeRecipeTab(1)}
                          >
                            <RecipeChevron direction="right" />
                          </button>
                        ),
                      }}
                      pager={
                        <div className="recipe-pager">
                          <button
                            className="recipe-nav-button"
                            disabled={!filtered.length}
                            aria-label="Previous recipe"
                            onClick={() => changeRecipePage(-1)}
                          >
                            <RecipeChevron direction="left" />
                          </button>
                          <span>
                            Page {filtered.length ? recipePage + 1 : 0}/
                            {filtered.length}
                          </span>
                          <button
                            className="recipe-nav-button"
                            disabled={!filtered.length}
                            aria-label="Next recipe"
                            onClick={() => changeRecipePage(1)}
                          >
                            <RecipeChevron direction="right" />
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
                    tabIndex={0}
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
