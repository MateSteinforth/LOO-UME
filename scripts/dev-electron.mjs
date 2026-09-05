import electronPath from "electron";
import { context } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ElectronDevelopmentSupervisor } from "./dev-electron-supervisor.ts";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "electron-dist/main.mjs");
const developmentData = resolve(root, "build/electron-development/user-data");
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");
const port = process.env.LOO_UME_ELECTRON_DEV_PORT ?? "5173";
if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65_535) {
  throw new Error("LOO_UME_ELECTRON_DEV_PORT must be from 1 through 65535.");
}
const editorUrl = `http://127.0.0.1:${port}`;

function start(command, args, options = {}) {
  return spawn(command, args, { cwd: root, ...options });
}

function streamViteOutput(child, ready) {
  const observe = (chunk) => {
    process.stdout.write(chunk);
    if (chunk.toString().includes(editorUrl)) ready();
  };
  child.stdout?.on("data", observe);
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
    if (chunk.toString().includes(editorUrl)) ready();
  });
}

await mkdir(developmentData, { recursive: true });
const supervisor = new ElectronDevelopmentSupervisor({
  startTimeoutMs: 120_000,
  stopTimeoutMs: 5_000,
  log: (message) => console.error(message),
  setExitCode: (code) => {
    process.exitCode = code;
  },
  spawnStage: () =>
    start(process.execPath, ["scripts/stage-sculpture-json.mjs"], {
      stdio: "inherit",
    }),
  spawnVite: () => {
    const child = start(
      process.execPath,
      [viteBin, "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return child;
  },
  waitForVite: (child) =>
    new Promise((resolvePromise, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off("error", onError);
        child.off("exit", onExit);
        if (error) reject(error);
        else resolvePromise();
      };
      const onReady = () => finish();
      const onError = (error) => finish(error);
      const onExit = () =>
        finish(new Error("Vite exited before it became ready."));
      const timer = setTimeout(
        () =>
          finish(
            new Error(`Vite did not report ${editorUrl} within 30 seconds.`),
          ),
        30_000,
      );
      streamViteOutput(child, onReady);
      child.once("error", onError);
      child.once("exit", onExit);
    }),
  spawnElectron: () =>
    start(electronPath, ["."], {
      stdio: "inherit",
      env: {
        ...process.env,
        LOO_UME_ELECTRON_DEVELOPMENT: "1",
        LOO_UME_ELECTRON_DEV_URL: editorUrl,
        LOO_UME_ELECTRON_DEVELOPMENT_DATA: developmentData,
      },
    }),
  watchMain: async (onBuild) => {
    const compiler = await context({
      entryPoints: [resolve(root, "electron/main.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      packages: "external",
      external: ["electron"],
      outfile: output,
      plugins: [
        {
          name: "restart-electron-on-main-build",
          setup(build) {
            build.onEnd((result) => onBuild(result.errors.length === 0));
          },
        },
      ],
    });
    await compiler.watch();
    return () => compiler.dispose();
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void supervisor.stop(0);
  });
}
await supervisor.start();
