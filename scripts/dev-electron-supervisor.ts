import type { ChildProcess } from "node:child_process";

const DEFAULT_STOP_TIMEOUT_MS = 5_000;

interface SupervisorOptions {
  startTimeoutMs: number;
  stopTimeoutMs?: number;
  log(message: string): void;
  setExitCode(code: number): void;
  spawnStage(): ChildProcess;
  spawnVite(): ChildProcess;
  waitForVite(child: ChildProcess): Promise<void>;
  spawnElectron(): ChildProcess;
  watchMain(onBuild: (success: boolean) => void): Promise<() => Promise<void>>;
}

function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (exited(child)) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    const onExit = (): void => finish(true);
    const onError = (): void => finish(false);
    const finish = (result: boolean): void => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      resolvePromise(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
    child.once("error", onError);
    if (exited(child)) finish(true);
  });
}

export class ElectronDevelopmentSupervisor {
  private stage: ChildProcess | undefined;
  private vite: ChildProcess | undefined;
  private electron: ChildProcess | undefined;
  private disposeWatch: (() => Promise<void>) | undefined;
  private stopping = false;
  private restarting = false;
  private shutdown: Promise<void> | undefined;

  constructor(private readonly options: SupervisorOptions) {}

  async start(): Promise<void> {
    try {
      this.stage = this.options.spawnStage();
      const stageExited = await waitForExit(
        this.stage,
        this.options.startTimeoutMs,
      );
      if (!stageExited || this.stage.exitCode !== 0) {
        throw new Error("stage:sculptures did not complete successfully.");
      }
      if (this.stopping) return;
      this.vite = this.options.spawnVite();
      this.vite.once("error", (error) =>
        this.fail(`Vite failed: ${error.message}`),
      );
      this.vite.once("exit", (code, signal) => {
        if (!this.stopping) this.fail(`Vite exited (${signal ?? code ?? 0}).`);
      });
      await this.options.waitForVite(this.vite);
      if (this.stopping) return;
      const disposeWatch = await this.options.watchMain((success) => {
        if (!success || this.stopping) return;
        if (!this.electron) void this.startElectron();
        else void this.restartElectron();
      });
      if (this.stopping) await disposeWatch();
      else this.disposeWatch = disposeWatch;
    } catch (error) {
      await this.stop(1);
      throw error;
    }
  }

  private async startElectron(): Promise<void> {
    if (this.stopping || this.electron) return;
    const child = this.options.spawnElectron();
    this.electron = child;
    child.once("error", (error) =>
      this.fail(`Electron failed: ${error.message}`),
    );
    child.once("exit", (code, signal) => {
      if (this.electron === child) this.electron = undefined;
      if (this.stopping) return;
      if (this.restarting) {
        this.restarting = false;
        void this.startElectron();
      } else if (code === 0) {
        void this.stop(0);
      } else this.fail(`Electron exited (${signal ?? code ?? 0}).`);
    });
  }

  private async restartElectron(): Promise<void> {
    if (this.stopping || this.restarting) return;
    if (!this.electron) return this.startElectron();
    this.restarting = true;
    await this.terminate(this.electron, "Electron");
    if (!this.stopping && !this.electron) {
      this.restarting = false;
      await this.startElectron();
    }
  }

  private async terminate(
    child: ChildProcess | undefined,
    label: string,
  ): Promise<void> {
    if (!child || exited(child)) return;
    child.kill("SIGTERM");
    if (
      await waitForExit(
        child,
        this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
      )
    )
      return;
    this.options.log(`${label} did not stop in time; sending SIGKILL.`);
    child.kill("SIGKILL");
    await waitForExit(
      child,
      this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
    );
  }

  private fail(message: string): void {
    this.options.log(`LOO/UME development stopped: ${message}`);
    void this.stop(1);
  }

  stop(exitCode = 0): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.stopping = true;
    this.shutdown = (async () => {
      await Promise.all([
        this.terminate(this.stage, "Asset staging"),
        this.terminate(this.electron, "Electron"),
        this.terminate(this.vite, "Vite"),
      ]);
      await this.disposeWatch?.();
      this.options.setExitCode(exitCode);
    })();
    return this.shutdown;
  }
}
