import path from "node:path";
import { exportPack } from "../lib/game-packs";
const destination = path.resolve(
  process.argv[2] ?? "dist/gtnh-2.8.4.gamepack.zip",
);
console.log("Building GTNH game pack…");
exportPack(process.cwd(), destination)
  .then((file) => console.log(file))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
