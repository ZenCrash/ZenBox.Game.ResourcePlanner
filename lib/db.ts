import { PrismaClient as AppClient } from "@/generated/app/client";
import { PrismaClient as CatalogClient } from "@/generated/catalog/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
const globalDb = globalThis as unknown as {
  appDb?: AppClient;
  catalogDb?: CatalogClient;
  catalogSchemaVersion?: number;
};
export const db =
  globalDb.appDb ??
  new AppClient({
    adapter: new PrismaBetterSqlite3({
      url: `file:${path.resolve("data/app.sqlite")}`,
    }),
  });
export const catalog =
  (globalDb.catalogSchemaVersion === 3 ? globalDb.catalogDb : undefined) ??
  new CatalogClient({
    adapter: new PrismaBetterSqlite3({
      url: `file:${path.resolve("data/catalogs/gtnh-2.8.4.sqlite")}`,
    }),
  });
globalDb.appDb = db;
globalDb.catalogDb = catalog;
globalDb.catalogSchemaVersion = 3;
