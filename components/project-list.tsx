"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Folder, Plus, GitBranch } from "lucide-react";
export type Project = {
  id: string;
  name: string;
  version: string;
  updatedAt: string;
  diagrams: { id: string; name: string }[];
};
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Request failed. Please try again.");
  return result;
}
export function ProjectList() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<Project[]>("/api/projects")
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <main className="landing">
      <header className="brand">
        <GitBranch size={23} /> RESOURCE<span className="muted"> / </span>
        PLANNER
      </header>
      <section className="home-content projects-page">
        <Link className="back" href="/games/minecraft">
          <ArrowLeft size={16} /> Minecraft editions
        </Link>
        <div className="project-title">
          <div>
            <div className="eyebrow">MINECRAFT / MODPACK</div>
            <h1>GT: New Horizons</h1>
            <p className="intro">
              Pick up where you left off. Or build something new.
            </p>
          </div>
          <img src="/assets/gtnh-2.8.4/logo.png" alt="GT New Horizons" />
        </div>
        <div className="section-label">
          <span>YOUR PROJECTS</span>
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New project
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {loading ? (
          <p>Loading projects…</p>
        ) : projects.length ? (
          <div className="project-rows">
            {projects.map((p) => (
              <Link
                className="project-row"
                href={`/projects/${p.id}${p.diagrams[0] ? `?diagram=${p.diagrams[0].id}` : ""}`}
                key={p.id}
              >
                <Folder />
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.diagrams.length} diagrams · Updated{" "}
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="badge">GTNH {p.version}</span>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-projects">
            <Folder size={35} />
            <h2>A fresh start for your next factory.</h2>
            <p>Create a project to begin your first production diagram.</p>
            <button className="primary" onClick={() => setCreating(true)}>
              Create your first project <Plus size={16} />
            </button>
          </div>
        )}
      </section>
      {creating && (
        <div className="modal-backdrop">
          <form
            className="dialog"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const p = await api<Project>("/api/projects", {
                  method: "POST",
                  body: JSON.stringify({ name, version: "2.8.4" }),
                });
                router.push(`/projects/${p.id}?diagram=${p.diagrams[0].id}`);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <div className="eyebrow">A NEW PRODUCTION LINE</div>
            <h2>Create project</h2>
            <label>
              Project name
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My first factory"
              />
            </label>
            <label>
              Modpack version
              <select defaultValue="2.8.4">
                <option>2.8.4</option>
              </select>
            </label>
            <p className="muted">
              Your project starts with a Main production diagram.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create project"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
