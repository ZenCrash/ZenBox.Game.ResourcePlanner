import Link from "next/link";
import { ArrowUpRight, GitBranch, Blocks } from "lucide-react";
export default function Home() {
  return (
    <main className="landing">
      <header className="brand">
        <GitBranch size={23} /> RESOURCE<span className="muted"> / </span>
        PLANNER
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
          <span>CHOOSE YOUR GAME</span>
        </div>
        <Link className="edition-row game-choice" href="/games/minecraft">
          <Blocks size={42} />
          <div>
            <h2>Minecraft</h2>
            <p>Choose Vanilla Minecraft or a modpack.</p>
          </div>
          <ArrowUpRight />
        </Link>
      </section>
    </main>
  );
}
