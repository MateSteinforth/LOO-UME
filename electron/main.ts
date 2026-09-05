import { mkdirSync, appendFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import updaterPackage from "electron-updater";
import {
  startLocalEditorServer,
  type LocalEditorServer,
} from "../scripts/local-editor-server.ts";
import { createEditorPipelineHandler } from "../scripts/editor-pipeline-handler.ts";
import { createProjectLibraryHandler } from "../scripts/project-library-handler.ts";
import {
  checkUnsignedDesktopUpdate,
  createDesktopUpdateHandler,
} from "./DesktopUpdateHandler.ts";
import { quitAfterLastWindowCloses } from "./DesktopLifecycle.ts";
import {
  developmentUserDataDirectory,
  resolveElectronRuntime,
} from "./DevelopmentMode.ts";
import { migrateLegacyProjectLibrary } from "./ProjectLibraryMigration.ts";
import { isApprovedCp2102 } from "./SerialPolicy.ts";
const { autoUpdater } = updaterPackage;

let mainWindow: BrowserWindow | undefined;
let localServer: LocalEditorServer | undefined;
let quitting = false;
let logPath = "";
const serialConfiguredSessions = new WeakSet<Electron.Session>();
const localReview = process.env.LOO_UME_LOCAL_ELECTRON_REVIEW === "1";
const localReviewUserData = process.env.LOO_UME_LOCAL_ELECTRON_REVIEW_DATA;
const runtime = resolveElectronRuntime(process.env, app.isPackaged);
const developmentUserData = developmentUserDataDirectory();

if (localReview && localReviewUserData && isAbsolute(localReviewUserData)) {
  mkdirSync(localReviewUserData, { recursive: true });
  app.setPath("userData", localReviewUserData);
} else if (developmentUserData) {
  mkdirSync(developmentUserData, { recursive: true });
  app.setPath("userData", developmentUserData);
}

let editorUrl: string | undefined = runtime.editorUrl;

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}\n`;
  process.stdout.write(line);
  if (logPath) {
    try {
      appendFileSync(logPath, line, { encoding: "utf8", mode: 0o600 });
    } catch {
      // The console remains available when the file cannot be written.
    }
  }
}

function packagedPath(path: string): string {
  return app.isPackaged
    ? resolve(process.resourcesPath, "app", path)
    : resolve(process.cwd(), path);
}

function isEditorUrl(value: string): boolean {
  if (!editorUrl) return false;
  try {
    return new URL(value).origin === new URL(editorUrl).origin;
  } catch {
    return false;
  }
}

function serialPortSummary(port: Electron.SerialPort): string {
  return JSON.stringify({
    portId: port.portId,
    portName: port.portName,
    displayName: port.displayName,
    vendorId: port.vendorId,
    productId: port.productId,
    usbDriverName: port.usbDriverName,
  });
}

function configureSerialSelection(window: BrowserWindow): void {
  const editorSession = window.webContents.session;
  if (serialConfiguredSessions.has(editorSession)) return;
  serialConfiguredSessions.add(editorSession);
  editorSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      permission === "serial" && isEditorUrl(requestingOrigin),
  );
  editorSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "serial" && isEditorUrl(webContents.getURL()));
    },
  );
  editorSession.on(
    "select-serial-port",
    (event, ports, webContents, callback) => {
      event.preventDefault();
      const owner = BrowserWindow.fromWebContents(webContents) ?? mainWindow;
      const approved = ports.filter(isApprovedCp2102);
      log(
        `Serial selection found ${ports.length} port(s) and ${approved.length} approved port(s).`,
      );
      for (const port of ports)
        log(`Serial candidate: ${serialPortSummary(port)}.`);
      if (approved.length === 0) {
        callback("");
        if (!owner) return;
        void dialog.showMessageBox(owner, {
          type: "warning",
          title: "CP2102 not found",
          message:
            "Connect the approved Silicon Labs CP2102 ESP32, then try again.",
        });
        return;
      }
      const buttons = [
        ...approved.map(
          (port) => port.displayName || port.portName || "CP2102 ESP32",
        ),
        "Cancel",
      ];
      if (!owner) {
        callback("");
        return;
      }
      void dialog
        .showMessageBox(owner, {
          type: "question",
          title: "Select the ESP32 serial device",
          message: "Select the Silicon Labs CP2102 used by this sculpture.",
          buttons,
          cancelId: buttons.length - 1,
          defaultId: 0,
          noLink: true,
        })
        .then(({ response }) => {
          if (response < approved.length) {
            const selected = approved[response]!;
            log(`Serial selection accepted: ${serialPortSummary(selected)}.`);
          } else {
            log("Serial selection cancelled.");
          }
          callback(
            response < approved.length ? approved[response]!.portId : "",
          );
        });
    },
  );
}

async function createWindow(): Promise<void> {
  if (!editorUrl) throw new Error("The local editor service is not ready.");
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 390,
    minHeight: 640,
    show: false,
    backgroundColor: "#111827",
    title: "LOO/UME",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  configureSerialSelection(window);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isEditorUrl(url)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  await window.loadURL(editorUrl);
}

async function startDesktop(): Promise<void> {
  const userData = app.getPath("userData");
  const generatedPublicDirectory = join(userData, "generated-public");
  const localProjects = join(userData, "projects", "local");
  const logs = join(userData, "logs");
  mkdirSync(generatedPublicDirectory, { recursive: true });
  mkdirSync(localProjects, { recursive: true });
  mkdirSync(logs, { recursive: true });
  logPath = join(logs, "desktop.log");
  log(`Desktop log: ${logPath}`);
  if (localReview) log("Local Electron review mode is active.");
  if (process.platform === "darwin" && !localReview && !runtime.development) {
    const legacyProjects = join(
      app.getPath("home"),
      "Library",
      "Application Support",
      "LOO-UME",
      "application",
      "projects",
      "local",
    );
    try {
      const migrated = await migrateLegacyProjectLibrary(
        legacyProjects,
        localProjects,
      );
      if (migrated.length > 0) {
        log(
          `Imported ${migrated.length} Project Library files from the earlier Mac installation.`,
        );
      }
    } catch (error) {
      log(
        `Earlier Project Library import was skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (runtime.development) {
    log(`Electron development renderer ready at ${editorUrl}`);
  } else {
    const rootDirectory = packagedPath("");
    const pipelineHandler = await createEditorPipelineHandler({
      rootDirectory,
      generatedPublicDirectory,
    });
    const projectLibraryHandler = createProjectLibraryHandler({
      rootDirectory,
      demoDirectory: packagedPath("projects/demos"),
      localDirectory: localProjects,
      manifestPath: packagedPath("projects/manifest.json"),
    });
    autoUpdater.autoDownload = false;
    autoUpdater.allowPrerelease = false;
    const applicationUpdateHandler = createDesktopUpdateHandler({
      currentVersion: app.getVersion(),
      enabled: app.isPackaged && !localReview,
      async check() {
        if (app.getVersion().startsWith("0.1.")) {
          return checkUnsignedDesktopUpdate(app.getVersion());
        }
        const result = await autoUpdater.checkForUpdates();
        return {
          available: result?.isUpdateAvailable ?? false,
          version: result?.updateInfo.version ?? app.getVersion(),
        };
      },
      async download() {
        await autoUpdater.downloadUpdate();
      },
      async install() {
        await localServer?.close();
        localServer = undefined;
        autoUpdater.quitAndInstall(false, true);
      },
    });
    localServer = await startLocalEditorServer({
      rootDirectory,
      distDirectory: packagedPath("dist"),
      generatedPublicDirectory,
      port: 0,
      pipelineHandler,
      projectLibraryHandler,
      applicationUpdateHandler,
    });
    editorUrl = localServer.url;
    log(`Desktop service ready at ${localServer.url}`);
  }
  await createWindow();
}

async function stopDesktop(): Promise<void> {
  const server = localServer;
  localServer = undefined;
  await server?.close();
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      void createWindow().catch((error) => log(String(error)));
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on("activate", () => {
    if (!mainWindow && !quitting) {
      void createWindow().catch((error) => log(String(error)));
    }
  });
  app.on("window-all-closed", () => {
    quitAfterLastWindowCloses(app);
  });
  app.on("before-quit", (event) => {
    if (quitting || !localServer) return;
    event.preventDefault();
    quitting = true;
    void stopDesktop().finally(() => app.quit());
  });
  app
    .whenReady()
    .then(startDesktop)
    .catch((error) => {
      log(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
      void dialog.showErrorBox("LOO/UME could not start", String(error));
      app.quit();
    });
}
