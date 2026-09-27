"use client";
import { useEffect, useRef, useState } from "react";
import type { CatalogGroup, CatalogTile } from "@/lib/catalog-layout";
import { ChevronLeft, ChevronRight, Info, Search } from "lucide-react";
import type { Item } from "@/lib/model";
import { api } from "./project-list";
import { ItemSlot, type Browse } from "./recipe-view";
import { AsyncCache } from "@/lib/async-cache";
type Result = {
  items: Item[];
  tiles: (CatalogTile & { item: Item; backgroundItem?: Item })[];
  itemGroups: CatalogGroup[];
  displayTotal: number;
  page: number;
  total: number;
  groups: string[];
  info: { completeness: string } | null;
};
const pages = new AsyncCache<Result>(32);
function preloadImages(result: Result) {
  const urls = new Set(
    result.tiles.flatMap((tile) => [
      tile.item.image,
      tile.backgroundItem?.image,
    ]),
  );
  for (const url of urls) {
    if (!url) continue;
    const image = new window.Image();
    image.src = url;
    void image.decode().catch(() => {});
  }
}
export function Inventory({
  onBrowse,
  onAddItem,
  picker = false,
  recentItems = [],
}: {
  onBrowse: Browse;
  onAddItem?: (item: Item) => void;
  picker?: boolean;
  recentItems?: Item[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState(8);
  const [pageSize, setPageSize] = useState(104);
  const body = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const previousQuery = useRef("");
  const [query, setQuery] = useState(""),
    [group, setGroup] = useState(""),
    [page, setPage] = useState(0),
    [result, setResult] = useState<Result>({
      items: [],
      tiles: [],
      itemGroups: [],
      displayTotal: 0,
      page: 0,
      total: 0,
      groups: [],
      info: null,
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const delay = previousQuery.current === query ? 0 : 120;
    previousQuery.current = query;
    const load = (targetPage: number) => {
      const url = `/api/catalog?q=${encodeURIComponent(query)}&group=${encodeURIComponent(group)}&page=${targetPage}&pageSize=${pageSize}&expanded=${[...expanded].sort().join(",")}`;
      return pages.get(url, () => api<Result>(url));
    };
    const run = () => {
      setLoading(true);
      load(page)
        .then((r) => {
          if (!active) return;
          setResult(r);
          setPage(r.page);
          setError("");
          for (const neighbor of [r.page + 1, r.page - 1]) {
            if (neighbor < 0 || neighbor * pageSize >= r.displayTotal) continue;
            void load(neighbor)
              .then((next) => {
                if (active) preloadImages(next);
              })
              .catch(() => {});
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    const timer = delay ? setTimeout(run, delay) : undefined;
    if (!delay) run();
    return () => {
      clearTimeout(timer);
      active = false;
    };
  }, [query, group, page, expanded, pageSize]);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => {
      const columnCount =
        getComputedStyle(element).gridTemplateColumns.split(" ").length;
      const rows = Math.max(
        1,
        Math.floor((body.current?.clientHeight ?? 468) / 36),
      );
      setColumns(columnCount);
      setPageSize(Math.min(1000, columnCount * rows));
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    if (body.current) resize.observe(body.current);
    measure();
    return () => resize.disconnect();
  }, []);
  const itemGroups = new Map(
    result.itemGroups.map((value) => [value.id, value]),
  );
  const runs: (typeof result.tiles)[] = [];
  for (const tile of result.tiles) {
    const last = runs.at(-1);
    if (tile.groupId && last?.[0].groupId === tile.groupId) last.push(tile);
    else runs.push([tile]);
  }
  let tileIndex = 0;
  return (
    <aside className={`inventory${picker ? " inventory-picker" : ""}`}>
      <div className="panel-heading">
        <span>ITEM CATALOG</span>
        <div className="catalog-heading-actions">
          <span className="badge">2.8.4</span>
          <div
            className="catalog-info"
            onMouseEnter={() => setInfoOpen(true)}
            onMouseLeave={() => setInfoOpen(false)}
          >
            <button
              aria-label="Item catalog information"
              aria-describedby={infoOpen ? "catalog-info-tooltip" : undefined}
              onFocus={() => setInfoOpen(true)}
              onBlur={() => setInfoOpen(false)}
              onClick={() => setInfoOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setInfoOpen(false);
                }
              }}
            >
              <Info size={18} strokeWidth={1.6} />
            </button>
            {infoOpen && (
              <div
                id="catalog-info-tooltip"
                className="catalog-info-tooltip"
                role="tooltip"
              >
                <p>Left click: recipes</p>
                <p>Right click: uses</p>
                <p>Shift-click the first group item to expand / collapse</p>
                <p>Ctrl-click: add item source to diagram</p>
                <small>
                  {result.total.toLocaleString()} items ·{" "}
                  {result.info?.completeness ??
                    "Development catalog incomplete"}
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="inventory-top">
        <select
          aria-label="Item subsets"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Item Subsets</option>
          {result.groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <div className="pagination">
          <button
            aria-label="Previous item page"
            disabled={!page || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            {page + 1} /{" "}
            {Math.max(1, Math.ceil(result.displayTotal / pageSize))}
          </span>
          <button
            aria-label="Next item page"
            disabled={(page + 1) * pageSize >= result.displayTotal || loading}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="inventory-body" ref={body}>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <>
            <div
              className="inventory-grid"
              ref={grid}
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              {runs.map((run) => (
                <div
                  key={run[0].id}
                  className="inventory-item-group"
                  role={run[0].groupId ? "group" : undefined}
                  aria-label={
                    run[0].groupId
                      ? itemGroups.get(run[0].groupId)?.name ||
                        `${run[0].item.name} variants`
                      : undefined
                  }
                >
                  {run.map((tile, index) => {
                    const at = tileIndex++;
                    const definition = tile.groupId
                      ? itemGroups.get(tile.groupId)
                      : null;
                    const same = (other: number) =>
                      !!tile.groupId &&
                      result.tiles[other]?.groupId === tile.groupId;
                    const background =
                      definition &&
                      (tile.expanded
                        ? definition.expandedColor
                        : definition.collapsedColor);
                    const border = background?.replace(
                      /([\d.]+)\)$/,
                      (_, alpha) => `${Math.min(1, Number(alpha) + 0.4)})`,
                    );
                    return (
                      <div className="inventory-group-cell" key={tile.id}>
                        {definition && (
                          <div
                            className="inventory-group-fill"
                            aria-hidden="true"
                            style={{
                              backgroundColor: background || undefined,
                              borderColor: border || undefined,
                              borderLeftWidth:
                                at % columns === 0 || !same(at - 1) ? 1.5 : 0,
                              borderRightWidth:
                                at % columns === columns - 1 || !same(at + 1)
                                  ? 1.5
                                  : 0,
                              borderTopWidth: !same(at - columns) ? 1.5 : 0,
                              borderBottomWidth: !same(at + columns) ? 1.5 : 0,
                            }}
                          />
                        )}
                        <ItemSlot
                          tooltipAtPointer
                          item={tile.item}
                          onBrowse={onBrowse}
                          onAddItem={onAddItem}
                          backgroundItem={tile.backgroundItem}
                          groupTitle={
                            !tile.expanded ? definition?.name : undefined
                          }
                          groupHint={
                            definition
                              ? `${definition.name || "Item group"} · ${tile.count} items${index === 0 ? ` · Shift-click to ${tile.expanded ? "collapse" : "expand"}` : ""}`
                              : undefined
                          }
                          groupExpanded={
                            definition && index === 0
                              ? tile.expanded
                              : undefined
                          }
                          onToggleGroup={
                            definition && index === 0
                              ? () =>
                                  setExpanded((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(definition.id))
                                      next.delete(definition.id);
                                    else next.add(definition.id);
                                    return next;
                                  })
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {!result.items.length && !loading && (
              <div className="catalog-empty">
                <Search />
                <h3>
                  {query ? "No matching items" : "Game data not bundled yet"}
                </h3>
                <p>
                  {query
                    ? "Try another name, item ID, or mod."
                    : "This development build is missing its GTNH 2.8.4 catalog. The finished planner will include it automatically; no game installation or file selection is required."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="inventory-bottom">
        {!picker && (
          <div
            className="recent-items"
            role="group"
            aria-label="Recently looked-up items"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {recentItems.slice(0, columns * 2).map((item) => (
              <ItemSlot
                key={item.id}
                item={item}
                onBrowse={onBrowse}
                onAddItem={onAddItem}
                tooltipAtPointer
              />
            ))}
          </div>
        )}
        <label className="search-input">
          <Search size={15} />
          <input
            autoFocus={picker}
            aria-label="Search items"
            placeholder="Search items…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setPage(0);
              }}
            >
              ×
            </button>
          )}
        </label>
      </div>
    </aside>
  );
}
