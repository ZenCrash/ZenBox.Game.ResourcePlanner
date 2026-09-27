"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, GitBranch, Upload } from "lucide-react";
import { GameLogo } from "./game-logo";
export function MinecraftEditions() {
  const [installed, setInstalled] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch("/api/game-packs")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load installed games.");
        const packs = await response.json();
        setInstalled(packs.gtnh.installed);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const install = (zip: File) => {
    setBusy(true);
    setProgress(0);
    setError("");
    const request = new XMLHttpRequest();
    request.open("POST", "/api/game-packs/gtnh");
    request.setRequestHeader("Content-Type", "application/zip");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setBusy(false);
      if (request.status === 201) setInstalled(true);
      else {
        try {
          setError(JSON.parse(request.responseText).error);
        } catch {
          setError("Could not install that ZIP.");
        }
      }
    };
    request.onerror = () => {
      setBusy(false);
      setError("Upload failed. Check the connection and try again.");
    };
    request.send(zip);
  };
  return (
    <main className="landing">
      <header className="brand">
        <GitBranch size={23} /> RESOURCE<span className="muted"> / </span>
        PLANNER
      </header>
      <section className="home-content projects-page">
        <Link className="back" href="/">
          <ArrowLeft size={16} /> All games
        </Link>
        <h1>Minecraft</h1>
        <p className="intro">
          Install a game pack to start planning. Your recipes and images stay
          available offline.
        </p>
        <div className="edition-list">
          <article className="edition-row">
            <GameLogo game="vanilla" />
            <div className="edition-description">
              <h2>
                Vanilla Minecraft <span className="badge">Coming soon</span>
              </h2>
              <p>Not installed</p>
            </div>
            <button disabled title="Vanilla Minecraft support is coming soon">
              <Upload size={16} /> Install ZIP
            </button>
          </article>
          <article className="edition-row">
            <GameLogo game="gtnh" />
            <div className="edition-description">
              <h2>GT: New Horizons</h2>
              <p>
                {loading
                  ? "Checking installation…"
                  : installed
                    ? "Installed · 2.8.4"
                    : "Not installed"}
              </p>
            </div>
            {installed ? (
              <div className="edition-actions">
                <Link className="primary edition-button" href="/games/gtnh">
                  Open projects
                </Link>
                <a
                  className="edition-button"
                  href="/api/game-packs/gtnh"
                  download="gtnh-2.8.4.gamepack.zip"
                >
                  <Download size={16} /> Download ZIP
                </a>
              </div>
            ) : (
              <button
                className="primary"
                disabled={loading || busy}
                onClick={() => file.current?.click()}
              >
                <Upload size={16} />{" "}
                {busy
                  ? progress < 100
                    ? `Uploading ${progress}%`
                    : "Validating and installing…"
                  : "Install ZIP"}
              </button>
            )}
          </article>
        </div>
        <input
          ref={file}
          type="file"
          accept=".zip,application/zip"
          hidden
          aria-label="GTNH game-pack ZIP"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (selected) install(selected);
          }}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="muted">
            {progress < 100
              ? "Uploading the game pack…"
              : "Checking the catalog and unpacking images. Keep this page open."}
          </p>
        )}
      </section>
    </main>
  );
}
