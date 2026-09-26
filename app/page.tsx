import Link from "next/link";
import { ArrowUpRight, GitBranch, Layers3 } from "lucide-react";
export default function Home() {
  return (
    <main className="landing">
      <header className="brand">
        <GitBranch size={23} />
        <span>
          RESOURCE<span className="muted"> / </span>PLANNER
        </span>
        <span className="badge">WORKSPACE</span>
      </header>
      <section className="home-content">
        <div className="eyebrow">A LITTLE PLANNING. A LOT MORE PRODUCTION.</div>
        <h1>
          Big ideas.
          <br />
          <span className="muted">Perfect ratios.</span>
        </h1>
        <p className="intro">
          Build your production lines, connect your recipes, and make every
          machine count.
        </p>
        <div className="section-label">
          <span>01 / CHOOSE YOUR GAME</span>
          <span>1 GAME AVAILABLE</span>
        </div>
        <div className="game-heading">
          <Layers3 size={18} /> Minecraft{" "}
          <span className="muted">/ Choose an edition</span>
        </div>
        <div className="game-grid">
          <button className="game-card vanilla" aria-disabled="true">
            <div className="logo-stage">
              <div className="minecraft-wordmark" role="img" aria-label="Minecraft"><span/><span/></div>
            </div>
            <div className="card-footer">
              <div>
                <h2>Vanilla Minecraft</h2>
                <p>The original sandbox.</p>
              </div>
              <span className="badge">COMING SOON</span>
            </div>
          </button>
          <Link href="/games/gtnh" className="game-card gtnh">
            <div className="logo-stage">
              <img
                src="/assets/gtnh-2.8.4/logo.png"
                alt="GregTech New Horizons"
              />
            </div>
            <div className="card-footer">
              <div>
                <h2>GT: New Horizons</h2>
                <p>One machine at a time. An entire world of possibilities.</p>
              </div>
              <ArrowUpRight size={22} />
            </div>
            <span className="version-tag">
              <i /> 2.8.4
            </span>
          </Link>
        </div>
        <footer className="home-footer">
          <span>YOUR NEXT FACTORY STARTS HERE.</span>
          <span>Diagrams. Recipes. Everything connected.</span>
        </footer>
      </section>
    </main>
  );
}
