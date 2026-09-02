import { execFile, spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function freePort(): Promise<number> {
  return await new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to reserve a test port."));
        return;
      }
      server.close(() => resolvePromise(address.port));
    });
  });
}

async function launcherFixture(): Promise<{
  root: string;
  launcher: string;
  environment: NodeJS.ProcessEnv;
  actions: string;
  opened: string;
  state: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "looume-launcher-"));
  temporaryDirectories.push(root);
  const scripts = join(root, "scripts");
  const state = join(root, "state");
  await mkdir(scripts, { recursive: true });
  const launcher = join(scripts, "looume.sh");
  await copyFile(resolve("scripts/looume.sh"), launcher);
  await chmod(launcher, 0o755);
  const actions = join(root, "actions.log");
  const opened = join(root, "opened.log");
  const server = join(scripts, "local-editor-server.ts");
  await writeFile(server, [
    'import { createServer } from "node:http";',
    'const server = createServer((request, response) => {',
    '  if (request.url === "/api/generator-status") {',
    '    response.setHeader("Content-Type", "application/json");',
    '    response.end(JSON.stringify({ schemaVersion: "1.0.0", generator: "manifold" }));',
    '    return;',
    '  }',
    '  if (request.url === "/" && process.env.LOO_UME_TEST_STALE_UI !== "1") {',
    '    response.setHeader("Content-Type", "text/html");',
    '    response.end("<title>LOO/UME test</title><div id=\\"app\\"></div>");',
    '    return;',
    '  }',
    '  response.statusCode = 404;',
    '  response.end("Not found.");',
    '});',
    'server.listen(Number(process.env.ORBITAL_LAB_PORT), "127.0.0.1");',
    'process.once("SIGTERM", () => server.close(() => process.exit(0)));',
    "",
  ].join("\n"));
  const bootstrap = join(root, "bootstrap.sh");
  await writeFile(bootstrap, [
    "#!/bin/sh",
    "set -eu",
    `printf '%s\\n' \"\${1-}\" >> '${actions}'`,
    `exec '${process.execPath}' '${server}'`,
    "",
  ].join("\n"));
  await chmod(bootstrap, 0o755);
  const open = join(root, "open.sh");
  await writeFile(open, [
    "#!/bin/sh",
    "set -eu",
    `printf '%s\\n' \"\$1\" >> '${opened}'`,
    "",
  ].join("\n"));
  await chmod(open, 0o755);
  const port = await freePort();
  return {
    root,
    launcher,
    actions,
    opened,
    state,
    environment: {
      ...process.env,
      LOO_UME_STATE_DIRECTORY: state,
      LOO_UME_PORT: String(port),
      LOO_UME_CURL_COMMAND: process.env.CURL ?? "/usr/bin/curl",
      LOO_UME_OPEN_COMMAND: open,
    },
  };
}

describe("LOO/UME managed launcher", () => {
  it("serializes concurrent starts, reopens one server, reports status, and stops it", async () => {
    const fixture = await launcherFixture();
    await mkdir(fixture.state, { recursive: true });
    await symlink("999999", join(fixture.state, "launch.lock.claim.1.999999"));
    await mkdir(join(fixture.state, "launch.lock"));
    await writeFile(join(fixture.state, "launch.lock", "owner.pid"), "999999\n");
    const [first, concurrent] = await Promise.all([
      execFileAsync("sh", [fixture.launcher], {
        env: fixture.environment,
        timeout: 15_000,
      }),
      execFileAsync("sh", [fixture.launcher], {
        env: fixture.environment,
        timeout: 15_000,
      }),
    ]);
    expect(`${first.stdout}${concurrent.stdout}`).toContain(
      "LOO/UME is running at http://127.0.0.1:",
    );
    expect(`${first.stdout}${concurrent.stdout}`).toContain("already running");
    const second = await execFileAsync("sh", [fixture.launcher], {
      env: fixture.environment,
      timeout: 5_000,
    });
    expect(second.stdout).toContain("already running");
    const statusResult = await execFileAsync("sh", [fixture.launcher, "--status"], {
      env: fixture.environment,
      timeout: 5_000,
    });
    expect(statusResult.stdout).toMatch(/running at .* \(PID \d+\)/);
    expect((await readFile(fixture.actions, "utf8")).trim().split("\n")).toEqual([
      "launch",
    ]);
    expect((await readdir(fixture.state)).some((name) => name.startsWith("launch.lock.claim.")))
      .toBe(false);
    expect((await readFile(fixture.opened, "utf8")).trim().split("\n")).toHaveLength(3);
    const stopped = await execFileAsync("sh", [fixture.launcher, "--stop"], {
      env: fixture.environment,
      timeout: 25_000,
    });
    expect(stopped.stdout).toContain("LOO/UME stopped.");
  });

  it("does not steal an atomically published live launch lock", async () => {
    const fixture = await launcherFixture();
    const acquired = join(fixture.root, "lock-acquired");
    const release = join(fixture.root, "release-lock");
    const hook = join(fixture.root, "hold-lock.sh");
    await writeFile(hook, [
      "#!/bin/sh",
      "set -eu",
      `touch '${acquired}'`,
      `while [ ! -f '${release}' ]; do sleep 0.05; done`,
      "",
    ].join("\n"));
    await chmod(hook, 0o755);

    const first = spawn("sh", [fixture.launcher], {
      env: {
        ...fixture.environment,
        LOO_UME_TEST_AFTER_LOCK_ACQUIRE: hook,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await stat(acquired);
        break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      }
    }
    expect((await stat(acquired)).isFile()).toBe(true);
    const lockClaim = (await readdir(fixture.state)).find((name) =>
      name.startsWith("launch.lock.claim.")
    );
    expect(lockClaim).toBeDefined();
    const lockPath = join(fixture.state, lockClaim!);
    expect(await readlink(lockPath)).toBe(String(first.pid));

    await expect(execFileAsync("sh", [fixture.launcher], {
      env: {
        ...fixture.environment,
        LOO_UME_LOCK_WAIT_SECONDS: "1",
      },
      timeout: 5_000,
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("another launch did not finish within 1 seconds"),
    });
    expect(await readlink(lockPath)).toBe(String(first.pid));

    await writeFile(release, "release\n");
    const firstResult = await new Promise<{ code: number | null; stderr: string }>(
      (resolvePromise) => {
        let stderr = "";
        first.stderr.on("data", (chunk) => { stderr += String(chunk); });
        first.once("close", (code) => resolvePromise({ code, stderr }));
      },
    );
    expect(firstResult).toEqual({ code: 0, stderr: "" });
    expect((await readFile(fixture.actions, "utf8")).trim()).toBe("launch");
    await execFileAsync("sh", [fixture.launcher, "--stop"], {
      env: fixture.environment,
      timeout: 25_000,
    });
  }, 10_000);

  it("honors a verified live legacy owner lock", async () => {
    const fixture = await launcherFixture();
    await mkdir(join(fixture.state, "launch.lock"), { recursive: true });
    const holder = spawn("sh", ["-c", "sleep 30", fixture.launcher], {
      stdio: "ignore",
    });
    try {
      await writeFile(
        join(fixture.state, "launch.lock", "owner.pid"),
        `${holder.pid}\n`,
      );
      await expect(execFileAsync("sh", [fixture.launcher], {
        env: {
          ...fixture.environment,
          LOO_UME_LOCK_WAIT_SECONDS: "1",
        },
        timeout: 5_000,
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("another launch did not finish within 1 seconds"),
      });
      expect((await readFile(fixture.actions, "utf8").catch(() => ""))).toBe("");
      expect(await readFile(join(fixture.state, "launch.lock", "owner.pid"), "utf8"))
        .toBe(`${holder.pid}\n`);
    } finally {
      holder.kill("SIGTERM");
      await new Promise((resolvePromise) => holder.once("close", resolvePromise));
    }
  });

  it("routes an update through the existing bootstrap update boundary", async () => {
    const fixture = await launcherFixture();
    await execFileAsync("sh", [fixture.launcher, "--update"], {
      env: fixture.environment,
      timeout: 15_000,
    });
    expect((await readFile(fixture.actions, "utf8")).trim()).toBe("update");
    await execFileAsync("sh", [fixture.launcher, "--stop"], {
      env: fixture.environment,
      timeout: 25_000,
    });
  });

  it("rejects an invalid port before starting anything", async () => {
    const fixture = await launcherFixture();
    await expect(execFileAsync("sh", [fixture.launcher], {
      env: { ...fixture.environment, LOO_UME_PORT: "invalid" },
      timeout: 5_000,
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("LOO_UME_PORT must be an integer"),
    });
    await expect(stat(fixture.actions)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an unrelated HTTP service on the selected port", async () => {
    const fixture = await launcherFixture();
    const port = await freePort();
    const unrelated = createHttpServer((_request, response) => response.end("other"));
    await new Promise<void>((resolvePromise, reject) => {
      unrelated.once("error", reject);
      unrelated.listen(port, "127.0.0.1", resolvePromise);
    });
    try {
      await expect(execFileAsync("sh", [fixture.launcher], {
        env: { ...fixture.environment, LOO_UME_PORT: String(port) },
        timeout: 5_000,
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("is in use by a process that is not"),
      });
      await expect(execFileAsync("sh", [fixture.launcher, "--stop"], {
        env: { ...fixture.environment, LOO_UME_PORT: String(port) },
        timeout: 5_000,
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("ownership could not be verified"),
      });
      await expect(stat(fixture.actions)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await new Promise<void>((resolvePromise) => unrelated.close(() => resolvePromise()));
    }
  });

  it("defines the self-installing application and automatic release contract", async () => {
    const application = await readFile(
      "macos/launcher/Contents/MacOS/LOO-UME",
      "utf8",
    );
    const plist = await readFile("macos/launcher/Contents/Info.plist", "utf8");
    const workflow = await readFile(
      ".github/workflows/macos-launcher-release.yml",
      "utf8",
    );
    const readme = await readFile("README.md", "utf8");
    const uninstaller = await readFile("macos/Uninstall LOO UME.command", "utf8");
    expect(application).toContain("$HOME/Library/Application Support/LOO-UME");
    expect(application).toContain("LOO_UME_APPLICATIONS_ROOT:-/Applications");
    expect(application).toContain("with administrator privileges");
    expect(application).toContain('"$git_command" clone --progress --branch main --single-branch');
    expect(application).toContain(".application.stage");
    expect(application).toContain("scripts/looume.sh\" launch");
    expect(application).not.toContain(".zprofile");
    expect(application).toContain('ln -s "$$" "$acquired_lock_claim"');
    expect(application).not.toContain('mkdir "$lock_path"');
    expect(application).toContain('tell application "Terminal"');
    expect(application).toContain("LOO_UME_FOLLOW_LOG=1");
    expect(application).toContain("LOO_UME_RESUMED_AFTER_COPY=1");
    expect(application).toContain("You can delete the downloaded ZIP");
    expect(application).toContain("recover_orphaned_server_record");
    expect(application.indexOf("recover_orphaned_server_record\n  progress \"Stopping"))
      .toBeLessThan(application.indexOf('"$checkout_root/scripts/looume.sh" --stop'));
    expect(application).toContain("--uninstall) uninstall_application");
    expect(plist).toContain("art.loo-ume.launcher");
    expect(plist).toContain("AppIcon");
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain('tags:\n      - "mac-launcher-v*"');
    expect(workflow).toContain("group: mac-launcher-${{ github.ref }}");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("launcher_version=0.1.$GITHUB_RUN_NUMBER");
    expect(workflow).toContain("LOO-UME-Mac-Launcher.zip");
    expect(workflow).toContain("Uninstall LOO UME.command");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("release_tag=mac-launcher-v0.1.$GITHUB_RUN_NUMBER");
    expect(workflow).toContain('--target "$GITHUB_SHA"');
    expect(workflow).toContain('existing_target" != "$GITHUB_SHA"');
    expect(workflow).toContain("--clobber");
    expect(workflow).toContain("--latest");
    expect(workflow).toContain("publish-review-download:");
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("release_tag=mac-launcher-review-$GITHUB_RUN_NUMBER");
    expect(workflow).toContain("--prerelease");
    expect(workflow).toContain("Direct Mac launcher review download");
    expect(workflow).toContain('[ "$GITHUB_REF" = refs/heads/main ]');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = \\');
    expect(workflow).toContain('"$(git rev-parse refs/remotes/origin/main)"');
    expect(workflow).toContain("git merge-base --is-ancestor HEAD refs/remotes/origin/main");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("permissions:\n      contents: write");
    expect(readme).toContain(
      "https://github.com/MateSteinforth/LOO-UME/releases/latest/download/LOO-UME-Mac-Launcher.zip",
    );
    expect(uninstaller.indexOf('if [ -x "$packaged_launcher" ]')).toBeLessThan(
      uninstaller.indexOf('if [ -x "$installed_launcher" ]'),
    );
    expect(uninstaller).toContain('exec /bin/sh "$packaged_launcher" --uninstall');
    expect(uninstaller).toContain('exec /bin/sh "$installed_launcher" --uninstall');
  });

  it("recovers and stops an orphaned managed server after its PID record was lost", async () => {
    const fixture = await launcherFixture();
    const port = Number(fixture.environment.LOO_UME_PORT);
    const serverScript = join(fixture.root, "scripts", "local-editor-server.ts");
    const server = spawn(process.execPath, [serverScript], {
      env: { ...process.env, ORBITAL_LAB_PORT: String(port) },
      stdio: "ignore",
    });
    const fakeLsof = join(fixture.root, "lsof.sh");
    await writeFile(fakeLsof, [
      "#!/bin/sh",
      `printf '%s\\n' '${server.pid}'`,
      `printf '%s\\n' '${server.pid}'`,
      "",
    ].join("\n"));
    await chmod(fakeLsof, 0o755);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/generator-status`);
        if (response.ok) break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      }
    }
    try {
      const launched = await execFileAsync("sh", [fixture.launcher], {
        env: {
          ...fixture.environment,
          LOO_UME_LSOF_COMMAND: fakeLsof,
        },
        timeout: 5_000,
      });
      expect(launched.stdout).toContain("recovered the ownership record");
      expect(launched.stdout).toContain("already running");
      expect(await readFile(join(fixture.state, "server.pid"), "utf8"))
        .toBe(`${server.pid}\n`);
      await expect(stat(fixture.actions)).rejects.toMatchObject({ code: "ENOENT" });
      const stopped = await execFileAsync("sh", [fixture.launcher, "--stop"], {
        env: {
          ...fixture.environment,
          LOO_UME_LSOF_COMMAND: fakeLsof,
        },
        timeout: 25_000,
      });
      expect(stopped.stdout).toContain("LOO/UME stopped.");
    } finally {
      if (server.exitCode === null) server.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => {
        if (server.exitCode !== null) resolvePromise();
        else server.once("close", () => resolvePromise());
      });
    }
  });

  it("restarts an owned API-only server whose editor files are gone", async () => {
    const fixture = await launcherFixture();
    const port = Number(fixture.environment.LOO_UME_PORT);
    const serverScript = join(fixture.root, "scripts", "local-editor-server.ts");
    const staleServer = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        ORBITAL_LAB_PORT: String(port),
        LOO_UME_TEST_STALE_UI: "1",
      },
      stdio: "ignore",
    });
    await mkdir(fixture.state, { recursive: true });
    await writeFile(join(fixture.state, "server.pid"), `${staleServer.pid}\n`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/generator-status`);
        if (response.ok) break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      }
    }
    try {
      const launched = await execFileAsync("sh", [fixture.launcher], {
        env: fixture.environment,
        timeout: 25_000,
      });
      expect(launched.stdout).toContain("owned server without its editor files");
      expect((await readFile(fixture.actions, "utf8")).trim()).toBe("launch");
      const editor = await fetch(`http://127.0.0.1:${port}/`);
      expect(await editor.text()).toContain('id="app"');
      expect(staleServer.exitCode).not.toBeNull();
      await execFileAsync("sh", [fixture.launcher, "--stop"], {
        env: fixture.environment,
        timeout: 25_000,
      });
    } finally {
      if (staleServer.exitCode === null) staleServer.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => {
        if (staleServer.exitCode !== null) resolvePromise();
        else staleServer.once("close", () => resolvePromise());
      });
    }
  });

  it("repairs an orphan record in the app before delegating to an older checkout", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-orphan-"));
    temporaryDirectories.push(home);
    const support = join(home, "support");
    const checkout = join(support, "application");
    const scripts = join(checkout, "scripts");
    const serverScript = join(scripts, "local-editor-server.ts");
    const delegatedLog = join(home, "delegated.log");
    await mkdir(join(checkout, ".git"), { recursive: true });
    await mkdir(scripts, { recursive: true });
    await writeFile(serverScript, [
      'import { createServer } from "node:http";',
      'const server = createServer((_request, response) => {',
      '  response.setHeader("Content-Type", "application/json");',
      '  response.end(JSON.stringify({ schemaVersion: "1.0.0", generator: "manifold" }));',
      '});',
      'server.listen(Number(process.env.ORBITAL_LAB_PORT), "127.0.0.1");',
      'process.once("SIGTERM", () => server.close(() => process.exit(0)));',
      "",
    ].join("\n"));
    await writeFile(join(scripts, "looume.sh"), [
      "#!/bin/sh",
      `cat '${checkout}/.tools/looume/server.pid' > '${delegatedLog}'`,
      "",
    ].join("\n"));
    await chmod(join(scripts, "looume.sh"), 0o755);
    const port = await freePort();
    const server = spawn(process.execPath, [serverScript], {
      env: { ...process.env, ORBITAL_LAB_PORT: String(port) },
      stdio: "ignore",
    });
    const fakeLsof = join(home, "lsof.sh");
    await writeFile(fakeLsof, [
      "#!/bin/sh",
      `printf '%s\\n' '${server.pid}'`,
      "",
    ].join("\n"));
    await chmod(fakeLsof, 0o755);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/generator-status`);
        if (response.ok) break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      }
    }
    try {
      const result = await execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
        env: {
          ...process.env,
          HOME: home,
          LOO_UME_SUPPORT_ROOT: support,
          LOO_UME_APPLICATIONS_ROOT: join(home, "Applications"),
          LOO_UME_SKIP_APP_COPY: "1",
          LOO_UME_OSASCRIPT_COMMAND: "/bin/false",
          LOO_UME_LSOF_COMMAND: fakeLsof,
          LOO_UME_PORT: String(port),
        },
        timeout: 5_000,
      });
      expect(result.stdout).toContain("Recovered the existing managed LOO/UME server");
      expect(await readFile(delegatedLog, "utf8")).toBe(`${server.pid}\n`);
    } finally {
      server.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => server.once("close", () => resolvePromise()));
    }
  });

  it("persists the next free port when another checkout owns the default", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-port-"));
    temporaryDirectories.push(home);
    const support = join(home, "support");
    const checkout = join(support, "application");
    const scripts = join(checkout, "scripts");
    const delegatedLog = join(home, "delegated.log");
    await mkdir(join(checkout, ".git"), { recursive: true });
    await mkdir(scripts, { recursive: true });
    await writeFile(join(scripts, "looume.sh"), [
      "#!/bin/sh",
      `printf '%s\\n' "$LOO_UME_PORT" > '${delegatedLog}'`,
      "",
    ].join("\n"));
    await chmod(join(scripts, "looume.sh"), 0o755);
    const port = await freePort();
    const foreignServer = createHttpServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ schemaVersion: "1.0.0", generator: "manifold" }));
    });
    await new Promise<void>((resolvePromise, reject) => {
      foreignServer.once("error", reject);
      foreignServer.listen(port, "127.0.0.1", resolvePromise);
    });
    const fakeLsof = join(home, "lsof.sh");
    await writeFile(fakeLsof, [
      "#!/bin/sh",
      `case "$*" in *"iTCP:${port}"*) printf '%s\\n' '$PPID' ;; esac`,
      "",
    ].join("\n"));
    await chmod(fakeLsof, 0o755);
    try {
      const result = await execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
        env: {
          ...process.env,
          HOME: home,
          LOO_UME_SUPPORT_ROOT: support,
          LOO_UME_APPLICATIONS_ROOT: join(home, "Applications"),
          LOO_UME_SKIP_APP_COPY: "1",
          LOO_UME_OSASCRIPT_COMMAND: "/bin/false",
          LOO_UME_LSOF_COMMAND: fakeLsof,
          LOO_UME_PORT: String(port),
        },
        timeout: 5_000,
      });
      expect(result.stdout).toContain(`will use port ${port + 1}`);
      expect(await readFile(delegatedLog, "utf8")).toBe(`${port + 1}\n`);
      expect(await readFile(join(checkout, ".tools", "looume", "server.port"), "utf8"))
        .toBe(`${port + 1}\n`);
    } finally {
      await new Promise<void>((resolvePromise) => foreignServer.close(() => resolvePromise()));
    }
  });

  it("opens a visible Terminal progress session for a normal Finder launch", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-terminal-"));
    temporaryDirectories.push(home);
    const osascriptLog = join(home, "osascript.log");
    const fakeOsascript = join(home, "osascript.sh");
    await writeFile(fakeOsascript, [
      "#!/bin/sh",
      'printf \'%s\\n\' "$@" > "$FAKE_OSASCRIPT_LOG"',
      "",
    ].join("\n"));
    await chmod(fakeOsascript, 0o755);
    await execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
      env: {
        ...process.env,
        HOME: home,
        FAKE_OSASCRIPT_LOG: osascriptLog,
        LOO_UME_OSASCRIPT_COMMAND: fakeOsascript,
        LOO_UME_SKIP_APP_COPY: "1",
      },
      timeout: 5_000,
    });
    const invocation = await readFile(osascriptLog, "utf8");
    expect(invocation).toContain('tell application "Terminal"');
    expect(invocation).toContain("LOO_UME_TERMINAL_SESSION=1");
    expect(invocation).toContain("macos/launcher/Contents/MacOS/LOO-UME");
    const application = await readFile("macos/launcher/Contents/MacOS/LOO-UME", "utf8");
    expect(application.lastIndexOf("\ninstall_application_bundle\n")).toBeLessThan(
      application.lastIndexOf("\nif open_progress_terminal; then exit 0; fi\n"),
    );
  });

  it("hands Terminal the stable installed application path", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-stable-terminal-"));
    temporaryDirectories.push(home);
    const applications = join(home, "Applications");
    const installedLauncher = join(
      applications,
      "LOO UME.app",
      "Contents",
      "MacOS",
      "LOO-UME",
    );
    await mkdir(join(applications, "LOO UME.app", "Contents", "MacOS"), {
      recursive: true,
    });
    await copyFile("macos/launcher/Contents/MacOS/LOO-UME", installedLauncher);
    await chmod(installedLauncher, 0o755);
    await copyFile(
      "macos/launcher/Contents/Info.plist",
      join(applications, "LOO UME.app", "Contents", "Info.plist"),
    );
    const osascriptLog = join(home, "osascript.log");
    const dittoLog = join(home, "ditto.log");
    const fakeDitto = join(home, "ditto.sh");
    await writeFile(fakeDitto, [
      "#!/bin/sh",
      'touch "$FAKE_DITTO_LOG"',
      "exit 1",
      "",
    ].join("\n"));
    await chmod(fakeDitto, 0o755);
    const fakeOsascript = join(home, "osascript.sh");
    await writeFile(fakeOsascript, [
      "#!/bin/sh",
      'printf \'%s\\n\' "$@" > "$FAKE_OSASCRIPT_LOG"',
      "",
    ].join("\n"));
    await chmod(fakeOsascript, 0o755);
    await execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
      env: {
        ...process.env,
        HOME: home,
        FAKE_OSASCRIPT_LOG: osascriptLog,
        FAKE_DITTO_LOG: dittoLog,
        LOO_UME_APPLICATIONS_ROOT: applications,
        LOO_UME_DITTO_COMMAND: fakeDitto,
        LOO_UME_OSASCRIPT_COMMAND: fakeOsascript,
      },
      timeout: 5_000,
    });
    const invocation = await readFile(osascriptLog, "utf8");
    expect(invocation).toContain(installedLauncher);
    expect(invocation).not.toContain(resolve("macos/launcher/Contents/MacOS/LOO-UME"));
    await expect(stat(dittoLog)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("backs up local projects and removes only the managed Mac installation", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-uninstall-"));
    temporaryDirectories.push(home);
    const support = join(home, "Library", "Application Support", "LOO-UME");
    const applications = join(home, "Applications");
    const installedApp = join(applications, "LOO UME.app");
    const localProjects = join(support, "application", "projects", "local");
    const managedScript = join(support, "application", "scripts", "looume.sh");
    const managedCommand = join(support, "bin", "looume");
    const commandLink = join(home, ".local", "bin", "looume");
    const stopLog = join(home, "stop.log");
    const fakeDitto = join(home, "ditto.sh");
    await mkdir(localProjects, { recursive: true });
    await mkdir(join(support, "application", "scripts"), { recursive: true });
    await mkdir(join(support, "bin"), { recursive: true });
    await mkdir(join(home, ".local", "bin"), { recursive: true });
    await mkdir(installedApp, { recursive: true });
    await writeFile(join(localProjects, "saved.loo.zip"), "project bytes");
    await writeFile(managedScript, [
      "#!/bin/sh",
      'printf \'%s\\n\' "$1" > "$FAKE_STOP_LOG"',
      "",
    ].join("\n"));
    await chmod(managedScript, 0o755);
    await writeFile(managedCommand, "managed command\n");
    await symlink(managedCommand, commandLink);
    await writeFile(fakeDitto, [
      "#!/bin/sh",
      'cp -R "$1" "$2"',
      "",
    ].join("\n"));
    await chmod(fakeDitto, 0o755);
    await execFileAsync("sh", [
      "macos/launcher/Contents/MacOS/LOO-UME",
      "--uninstall",
    ], {
      env: {
        ...process.env,
        HOME: home,
        FAKE_STOP_LOG: stopLog,
        LOO_UME_SUPPORT_ROOT: support,
        LOO_UME_APPLICATIONS_ROOT: applications,
        LOO_UME_DOCUMENTS_ROOT: join(home, "Documents"),
        LOO_UME_CONFIRM_UNINSTALL: "1",
        LOO_UME_DITTO_COMMAND: fakeDitto,
        LOO_UME_OSASCRIPT_COMMAND: "/bin/false",
      },
      timeout: 5_000,
    });
    expect(await readFile(stopLog, "utf8")).toBe("--stop\n");
    await expect(stat(support)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(installedApp)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(commandLink)).rejects.toMatchObject({ code: "ENOENT" });
    const backups = await readdir(join(home, "Documents"));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(
      home,
      "Documents",
      backups[0]!,
      "saved.loo.zip",
    ), "utf8")).toBe("project bytes");
  });

  it("installs a verified checkout atomically and creates the Mac command", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-home-"));
    temporaryDirectories.push(home);
    const support = join(home, "Library", "Application Support", "LOO-UME");
    const applications = join(home, "Applications");
    const fakeGit = join(home, "git.sh");
    const launchLog = join(home, "launch.log");
    await mkdir(support, { recursive: true });
    await mkdir(join(support, "install.lock"));
    await writeFile(join(support, "install.lock", "owner.pid"), "999999\n");
    await mkdir(join(support, ".application.stage"));
    await writeFile(join(support, ".application.stage", "partial"), "partial");
    await writeFile(fakeGit, [
      "#!/bin/sh",
      "set -eu",
      'if [ "${1-}" = --version ]; then echo "git version test"; exit 0; fi',
      'if [ "${1-}" = clone ]; then',
      "  for destination do :; done",
      '  mkdir -p "$destination/.git" "$destination/scripts"',
      '  printf \'%s\\n\' \'#!/bin/sh\' \'printf "%s\\n" "$1" >> "$FAKE_LAUNCH_LOG"\' > "$destination/scripts/looume.sh"',
      "  exit 0",
      "fi",
      'if [ "${1-}" = -C ] && [ "${3-}" = remote ]; then',
      '  echo "https://github.com/MateSteinforth/LOO-UME.git"',
      "  exit 0",
      "fi",
      'if [ "${1-}" = -C ] && [ "${3-}" = branch ]; then echo main; exit 0; fi',
      "exit 1",
      "",
    ].join("\n"));
    await chmod(fakeGit, 0o755);
    await execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
      env: {
        ...process.env,
        HOME: home,
        FAKE_LAUNCH_LOG: launchLog,
        LOO_UME_SUPPORT_ROOT: support,
        LOO_UME_APPLICATIONS_ROOT: applications,
        LOO_UME_SKIP_APP_COPY: "1",
        LOO_UME_GIT_COMMAND: fakeGit,
        LOO_UME_OSASCRIPT_COMMAND: "/bin/false",
        LOO_UME_XCODE_SELECT_COMMAND: "/bin/false",
      },
      timeout: 5_000,
    });
    expect(await readFile(launchLog, "utf8")).toBe("launch\n");
    expect((await stat(join(support, "application", ".git"))).isDirectory()).toBe(true);
    expect(await readlink(join(home, ".local", "bin", "looume"))).toBe(
      `${support}/bin/looume`,
    );
    expect((await readdir(support)).some((name) => name.startsWith("install.lock.claim.")))
      .toBe(false);
    expect((await readdir(support)).some((name) => name.startsWith(".application.stage")))
      .toBe(false);
  });

  it("recovers an interrupted application copy before replacing the launcher", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-copy-"));
    temporaryDirectories.push(home);
    const applications = join(home, "Applications");
    const support = join(home, "support");
    const copyLock = join(applications, ".LOO-UME.copy.lock");
    const backup = join(applications, ".LOO-UME.app.backup");
    await mkdir(applications, { recursive: true });
    await mkdir(copyLock);
    await writeFile(join(copyLock, "owner.pid"), "999999\n");
    await mkdir(backup);
    await writeFile(join(backup, "previous"), "previous");
    await mkdir(join(applications, ".LOO-UME.app.stage"));
    await writeFile(join(applications, ".LOO-UME.app.stage", "partial"), "partial");
    const fakeDitto = join(home, "ditto.sh");
    await writeFile(fakeDitto, [
      "#!/bin/sh",
      "set -eu",
      'cp -R "$1" "$2"',
      "",
    ].join("\n"));
    await chmod(fakeDitto, 0o755);
    const openLog = join(home, "open.log");
    const fakeOpen = join(home, "open.sh");
    await writeFile(fakeOpen, [
      "#!/bin/sh",
      `printf '%s\\n' \"\$1\" > '${openLog}'`,
      "",
    ].join("\n"));
    await chmod(fakeOpen, 0o755);
    await execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
      env: {
        ...process.env,
        HOME: home,
        LOO_UME_SUPPORT_ROOT: support,
        LOO_UME_APPLICATIONS_ROOT: applications,
        LOO_UME_DITTO_COMMAND: fakeDitto,
        LOO_UME_APP_OPEN_COMMAND: fakeOpen,
        LOO_UME_OSASCRIPT_COMMAND: "/bin/false",
      },
      timeout: 5_000,
    });
    const installed = join(applications, "LOO UME.app");
    expect(await readFile(join(installed, "Contents", "Info.plist"), "utf8"))
      .toContain("art.loo-ume.launcher");
    expect(await readFile(openLog, "utf8")).toBe(`${installed}\n`);
    expect((await readdir(applications)).some((name) =>
      name.startsWith(".LOO-UME.copy.lock.claim.")))
      .toBe(false);
    expect(await readdir(applications)).not.toContain(".LOO-UME.app.stage");
    expect(await readdir(applications)).not.toContain(".LOO-UME.app.backup");
  });

  it("removes a failed first-install staging checkout", async () => {
    const home = await mkdtemp(join(tmpdir(), "looume-mac-failure-"));
    temporaryDirectories.push(home);
    const support = join(home, "support");
    const fakeGit = join(home, "git.sh");
    await writeFile(fakeGit, [
      "#!/bin/sh",
      'if [ "${1-}" = --version ]; then exit 0; fi',
      'if [ "${1-}" = clone ]; then echo "Counting download objects..." >&2; mkdir -p "${7-}"; exit 1; fi',
      "exit 1",
      "",
    ].join("\n"));
    await chmod(fakeGit, 0o755);
    await expect(execFileAsync("sh", ["macos/launcher/Contents/MacOS/LOO-UME"], {
      env: {
        ...process.env,
        HOME: home,
        LOO_UME_SUPPORT_ROOT: support,
        LOO_UME_APPLICATIONS_ROOT: join(home, "Applications"),
        LOO_UME_SKIP_APP_COPY: "1",
        LOO_UME_TERMINAL_SESSION: "1",
        LOO_UME_GIT_COMMAND: fakeGit,
        LOO_UME_OSASCRIPT_COMMAND: "/bin/false",
        LOO_UME_XCODE_SELECT_COMMAND: "/bin/false",
      },
      timeout: 5_000,
    })).rejects.toMatchObject({
      stderr: expect.stringMatching(
        /Counting download objects\.\.\.[\s\S]*application download failed/,
      ),
    });
    expect(await readdir(support)).not.toContain("application");
    expect((await readdir(support)).some((name) => name.startsWith("install.lock.claim.")))
      .toBe(false);
    expect((await readdir(support)).some((name) => name.startsWith(".application.stage")))
      .toBe(false);
  });
});
