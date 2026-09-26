import { defineConfig } from "prisma/config";
import path from "node:path";
export default defineConfig({
  schema: process.env.CATALOG_DB
    ? "prisma/catalog.prisma"
    : "prisma/app.prisma",
  datasource: {
    url: `file:${path.resolve(process.env.CATALOG_DB ? "data/catalogs/gtnh-2.8.4.sqlite" : "data/app.sqlite").replaceAll("\\", "/")}`,
  },
});
