// scripts/sync-api-console-routes.mjs

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(projectRoot, "src", "app", "api");

const outputFile = path.join(
  projectRoot,
  "src",
  "lib",
  "api-console",
  "generatedRouteIndex.ts"
);

const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const functionExportPattern =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

const constExportPattern =
  /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function getMethods(fileContent) {
  const methods = new Set();

  for (const match of fileContent.matchAll(functionExportPattern)) {
    methods.add(match[1]);
  }

  for (const match of fileContent.matchAll(constExportPattern)) {
    methods.add(match[1]);
  }

  return [...methods]
    .filter((method) => METHODS.includes(method))
    .sort();
}

function getApiPath(routeFilePath) {
  const routeDirectory = path.dirname(path.relative(apiRoot, routeFilePath));

  if (routeDirectory === ".") {
    return "/api";
  }

  return `/api/${routeDirectory.split(path.sep).join("/")}`;
}

function getSourceFile(routeFilePath) {
  return path
    .relative(projectRoot, routeFilePath)
    .split(path.sep)
    .join("/");
}

function createGeneratedFile(routes) {
  return `/**
 * AUTO-GENERATED FILE.
 * Run: npm run api:sync
 * Do not manually edit this file.
 */

export type GeneratedApiMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type GeneratedApiRoute = {
  method: GeneratedApiMethod;
  path: string;
  sourceFile: string;
};

export const generatedApiRoutes: GeneratedApiRoute[] = ${JSON.stringify(
    routes,
    null,
    2
  )};
`;
}

if (!fs.existsSync(apiRoot)) {
  console.error(`API directory was not found: ${apiRoot}`);
  process.exit(1);
}

const routeFiles = walk(apiRoot);

const routes = routeFiles
  .flatMap((routeFile) => {
    const content = fs.readFileSync(routeFile, "utf8");
    const methods = getMethods(content);

    const routePath = getApiPath(routeFile);
    const sourceFile = getSourceFile(routeFile);

    return methods.map((method) => ({
      method,
      path: routePath,  
      sourceFile,
    }));
  })
    .filter(
    (route) =>
      !route.path.startsWith("/api/internal/api-console/")
  )
  .sort((first, second) => {
    const pathComparison = first.path.localeCompare(second.path);

    if (pathComparison !== 0) {
      return pathComparison;
    }

    return first.method.localeCompare(second.method);
  });

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, createGeneratedFile(routes), "utf8");

console.log(
  `Manna API Console: indexed ${routes.length} route method(s) from ${routeFiles.length} route file(s).`
);