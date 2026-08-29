import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = "1.0.0";

function fail(message) {
  throw new Error(`desktop build receipt: ${message}`);
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

async function collectFiles(root, directory = root) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(root, path));
      continue;
    }
    if (!entry.isFile()) fail(`unsupported output entry ${path}`);
    const bytes = await readFile(path);
    result.push({
      path: relative(root, path).split(sep).join("/"),
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return result;
}

function parseArguments(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined || options.has(name)) {
      fail("use create|verify --root PATH --receipt PATH --target TARGET --commit COMMIT");
    }
    options.set(name, value);
  }
  for (const name of ["--root", "--receipt", "--target", "--commit"]) {
    if (!options.has(name)) fail(`missing ${name}`);
  }
  return Object.fromEntries(options);
}

function assertIdentity(target, commit) {
  if (!/^(linux-x64|darwin-arm64|darwin-x64)$/.test(target)) {
    fail(`unsupported target ${target}`);
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
    fail("commit must be a complete lowercase Git object ID");
  }
}

async function expectedReceipt(options) {
  const root = resolve(options["--root"]);
  const dist = resolve(root, "dist");
  const receipt = resolve(options["--receipt"]);
  if (!isInside(root, receipt)) fail("receipt must stay inside the repository");
  assertIdentity(options["--target"], options["--commit"]);
  const files = await collectFiles(dist);
  if (!files.some((file) => file.path === "index.html")) {
    fail("dist/index.html is missing");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    target: options["--target"],
    commit: options["--commit"],
    files,
  };
}

export async function createReceipt(options) {
  const value = await expectedReceipt(options);
  const receipt = resolve(options["--receipt"]);
  const temporary = `${receipt}.tmp.${process.pid}`;
  await mkdir(dirname(receipt), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, receipt);
}

export async function verifyReceipt(options) {
  const receipt = resolve(options["--receipt"]);
  const metadata = await lstat(receipt);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("receipt is not a regular file");
  const [stored, expected] = await Promise.all([
    readFile(receipt, "utf8").then((text) => JSON.parse(text)),
    expectedReceipt(options),
  ]);
  if (JSON.stringify(stored) !== JSON.stringify(expected)) {
    fail("receipt does not match the complete production output");
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entrypoint === import.meta.url) {
  const [operation, ...argumentsList] = process.argv.slice(2);
  const options = parseArguments(argumentsList);
  if (operation === "create") await createReceipt(options);
  else if (operation === "verify") await verifyReceipt(options);
  else fail("operation must be create or verify");
}
