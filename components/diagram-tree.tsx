"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Workflow,
  MoreHorizontal,
  Download,
} from "lucide-react";
import { api } from "./project-list";
import {
  moveTreeEntries,
  reconcileTree,
  selectTreeEntry,
  visibleTree,
  type DiagramTree as Tree,
  type TreeEntry,
} from "@/lib/diagram-tree";
type Diagram = { id: string; name: string };
type Drop = { id: string | null; position: "before" | "after" | "inside" };
export function DiagramTree({
  projectId,
  diagrams,
  active,
  disabled,
  onOpen,
  onCreate,
  onRename,
  onExport,
}: {
  projectId: string;
  diagrams: Diagram[];
  active: string;
  disabled: boolean;
  onOpen: (id: string) => Promise<void>;
  onCreate: () => void;
  onRename: (diagram: Diagram) => void;
  onExport: (format: "json" | "svg" | "pdf", entries: TreeEntry[], progress: (text: string) => void) => Promise<void>;
}) {
  const [tree, setTree] = useState<Tree>({ revision: 0, entries: [] });
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const exportMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const outside = (event: PointerEvent) => { if (!exportMenu.current?.contains(event.target as Node)) setExportOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExportOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [exportOpen]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set<string>(active ? [active] : []));
  useEffect(() => { if (active) setSelected(new Set([active])); }, [active]);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [drop, setDrop] = useState<Drop | null>(null);
  const dragging = useRef<Set<string> | null>(null),
    saving = useRef(false),
    renaming = useRef(false);
  const url = "/api/projects/" + projectId + "/tree";
  useEffect(() => {
    let cancelled = false;
    api<Tree>(url)
      .then((value) => {
        if (!cancelled) setTree(value);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const entries = useMemo(
    () => reconcileTree(tree.entries, diagrams),
    [tree.entries, diagrams],
  );
  const rows = useMemo(() => visibleTree(entries), [entries]);
  const names = new Map(diagrams.map((d) => [d.id, d.name]));
  const blocked = loading || busy || disabled;
  async function persist(next: TreeEntry[]) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    const previous = tree;
    setTree({ ...tree, entries: next });
    try {
      setTree(
        await api<Tree>(url, {
          method: "PUT",
          body: JSON.stringify({ revision: tree.revision, entries: next }),
        }),
      );
      return true;
    } catch (e) {
      setTree(previous);
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function rename() {
    if (!editing || renaming.current) return;
    const name = editing.name.trim();
    if (!name) {
      setError("Enter a name.");
      return;
    }
    const entry = entries.find((e) => e.id === editing.id);
    if (!entry) {
      setEditing(null);
      return;
    }
    renaming.current = true;
    try {
      if (entry.kind === "folder") {
        if (
          !(await persist(
            entries.map((e) => (e.id === entry.id ? { ...e, name } : e)),
          ))
        )
          return;
      } else {
        setBusy(true);
        setError("");
        onRename(
          await api<Diagram>("/api/diagrams/" + entry.id, {
            method: "PATCH",
            body: JSON.stringify({ name }),
          }),
        );
      }
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      renaming.current = false;
      setBusy(false);
    }
  }
  async function addFolder() {
    const id = crypto.randomUUID();
    const parentId =
      (selected.size === 1 &&
        entries.find((e) => selected.has(e.id) && e.kind === "folder")?.id) ||
      null;
    if (
      await persist([
        ...entries.map((e) =>
          e.id === parentId ? { ...e, collapsed: false } : e,
        ),
        { id, kind: "folder", parentId, name: "New folder" },
      ])
    ) {
      setSelected(new Set([id]));
      setEditing({ id, name: "New folder" });
    }
  }
  function finishDrop(target: Drop) {
    const moving = dragging.current;
    dragging.current = null;
    setDrop(null);
    if (!moving || blocked) return;
    try {
      const next = moveTreeEntries(entries, moving, target.id, target.position);
      if (next !== entries) void persist(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="panel-heading diagram-tree-heading">
        DIAGRAMS{" "}
        <div className="diagram-tree-tools">
          <button
            type="button"
            aria-label="Create diagram"
            title="Create diagram"
            disabled={blocked}
            onClick={onCreate}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            aria-label="Create folder"
            title="Create folder"
            disabled={blocked}
            onClick={() => void addFolder()}
          >
            <FolderPlus size={16} />
          </button>
          <div className="diagram-tree-export" ref={exportMenu}>
            <button type="button" aria-label="Download all diagrams" title="Download all diagrams" aria-haspopup="menu" aria-expanded={exportOpen} disabled={blocked || !!exportProgress || !diagrams.length} onClick={() => setExportOpen(value => !value)}>
              <MoreHorizontal size={16} />
            </button>
            {exportOpen && <div className="diagram-actions-menu" role="menu" aria-label="Download all diagrams">
              {(["json", "svg", "pdf"] as const).map(format => <button key={format} type="button" role="menuitem" onClick={async () => {
                setExportOpen(false); setExportProgress("Preparing export…"); setError("");
                try { await onExport(format, entries, setExportProgress); }
                catch (error) { setError((error as Error).message); }
                finally { setExportProgress(""); }
              }}><Download size={16} />Download all as {format.toUpperCase()} (.zip)</button>)}
            </div>}
          </div>
        </div>
      </div>
      {exportProgress && <p className="tree-status" role="status">{exportProgress}</p>}
      <nav
        className="diagram-tree"
        aria-label="Project diagrams"
        onKeyDown={(e) => e.stopPropagation()}
      >
        {loading ? (
          <p className="muted">Loading diagrams…</p>
        ) : (
          <div
            role="tree"
            aria-label="Diagrams and folders"
            aria-multiselectable="true"
          >
            {rows.map(({ entry, depth }) => {
              const name =
                entry.kind === "folder" ? entry.name! : names.get(entry.id)!;
              const folder = entry.kind === "folder";
              const Icon = folder
                ? entry.collapsed
                  ? Folder
                  : FolderOpen
                : Workflow;
              const dropClass =
                drop?.id === entry.id ? " drop-" + drop.position : "";
              return (
                <div
                  key={entry.id}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-selected={selected.has(entry.id)}
                  aria-expanded={folder ? !entry.collapsed : undefined}
                  aria-label={name}
                  tabIndex={0}
                  className={
                    "diagram-tree-row" +
                    (selected.has(entry.id) ? " selected" : "") +
                    (active === entry.id ? " current" : "") +
                    dropClass
                  }
                  style={{ paddingLeft: 0 }}
                  onClick={(e) => {
                    if (blocked || editing) return;
                    const additive = e.ctrlKey || e.metaKey;
                    setSelected(
                      selectTreeEntry(entries, selected, entry.id, additive),
                    );
                    if (!additive && !folder) void onOpen(entry.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || blocked) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(
                        selectTreeEntry(
                          entries,
                          selected,
                          entry.id,
                          e.ctrlKey || e.metaKey,
                        ),
                      );
                      if (
                        e.key === "Enter" &&
                        !folder &&
                        !e.ctrlKey &&
                        !e.metaKey
                      )
                        void onOpen(entry.id);
                    }
                    if (e.key === "F2") {
                      e.preventDefault();
                      setEditing({ id: entry.id, name });
                    }
                    if (
                      folder &&
                      (e.key === "ArrowLeft" || e.key === "ArrowRight")
                    ) {
                      e.preventDefault();
                      void persist(
                        entries.map((n) =>
                          n.id === entry.id
                            ? { ...n, collapsed: e.key === "ArrowLeft" }
                            : n,
                        ),
                      );
                    }
                  }}
                  onDragOver={(e) => {
                    if (!dragging.current || blocked) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    const bounds = e.currentTarget.getBoundingClientRect(),
                      fraction = (e.clientY - bounds.top) / bounds.height;
                    setDrop({
                      id: entry.id,
                      position:
                        folder && fraction > 0.25 && fraction < 0.75
                          ? "inside"
                          : fraction < 0.5
                            ? "before"
                            : "after",
                    });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (drop?.id === entry.id) finishDrop(drop);
                  }}
                >
                  <button
                    className="tree-grip"
                    style={{ marginRight: depth * 14 }}
                    type="button"
                    title={"Drag " + name}
                    aria-label={"Drag " + name}
                    draggable={!blocked && !editing}
                    disabled={blocked}
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      const moving = selected.has(entry.id)
                        ? new Set(selected)
                        : selectTreeEntry(entries, new Set(), entry.id, false);
                      setSelected(moving);
                      dragging.current = moving;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", entry.id);
                      e.dataTransfer.setDragImage(
                        e.currentTarget.parentElement!,
                        15,
                        15,
                      );
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      setDrop(null);
                    }}
                  >
                    <GripVertical size={14} />
                  </button>
                  {folder && (
                    <button
                      className="tree-chevron"
                      type="button"
                      aria-label={
                        (entry.collapsed ? "Expand " : "Collapse ") + name
                      }
                      disabled={blocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        void persist(
                          entries.map((n) =>
                            n.id === entry.id
                              ? { ...n, collapsed: !n.collapsed }
                              : n,
                          ),
                        );
                      }}
                    >
                      {entry.collapsed ? (
                        <ChevronRight size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  )}
                  <Icon size={15} className="tree-kind-icon" />
                  {editing?.id === entry.id ? (
                    <input
                      aria-label={"Rename " + name}
                      maxLength={100}
                      autoFocus
                      value={editing.name}
                      disabled={busy}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      onBlur={() => {
                        if (!renaming.current) void rename();
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void rename();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditing(null);
                          setError("");
                        }
                      }}
                    />
                  ) : (
                    <span className="tree-name" title={name}>
                      {name}
                    </span>
                  )}
                  <button
                    className="tree-rename"
                    type="button"
                    title={"Rename " + name}
                    aria-label={"Rename " + name}
                    disabled={blocked}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({ id: entry.id, name });
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              );
            })}
            <div
              className={
                "tree-root-drop" + (drop?.id === null ? " drop-inside" : "")
              }
              onDragOver={(e) => {
                if (!dragging.current || blocked) return;
                e.preventDefault();
                setDrop({ id: null, position: "inside" });
              }}
              onDrop={(e) => {
                e.preventDefault();
                finishDrop({ id: null, position: "inside" });
              }}
            >
              {drop
                ? "Drop here to move to the top level"
                : rows.length
                  ? ""
                  : "No diagrams yet"}
            </div>
          </div>
        )}
      </nav>
      {busy && (
        <p className="tree-status" role="status">
          Saving diagram list…
        </p>
      )}
      {error && (
        <div className="tree-error" role="alert">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setLoading(true);
              api<Tree>(url)
                .then((value) => {
                  setTree(value);
                  setError("");
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Reload list
          </button>
        </div>
      )}
    </>
  );
}
