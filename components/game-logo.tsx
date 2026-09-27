import Image from "next/image";
import gtnhLogo from "@/public/logos/gtnh.png";
import vanillaLogo from "@/public/logos/vanilla-minecraft.png";

export function GameLogo({ game }: { game: "minecraft" | "vanilla" | "gtnh" }) {
  return (
    <span className="game-logo" aria-hidden="true">
      {game === "minecraft" ? (
        // The original Minecraft title texture stores the wordmark in two rows.
        <svg viewBox="0 0 274 44" focusable="false">
          <svg width="155" height="44" viewBox="0 0 155 44" overflow="hidden">
            <image href="/logos/minecraft.png" width="256" height="256" />
          </svg>
          <svg
            x="155"
            width="119"
            height="44"
            viewBox="0 45 119 44"
            overflow="hidden"
          >
            <image href="/logos/minecraft.png" width="256" height="256" />
          </svg>
        </svg>
      ) : (
        <Image
          src={game === "vanilla" ? vanillaLogo : gtnhLogo}
          alt=""
          sizes="140px"
        />
      )}
    </span>
  );
}
