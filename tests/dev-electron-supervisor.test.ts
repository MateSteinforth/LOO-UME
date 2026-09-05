import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ElectronDevelopmentSupervisor } from "../scripts/dev-electron-supervisor.ts";

class Child extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  signals: string[] = [];
  constructor(
    private readonly exitsOn: readonly string[] = ["SIGTERM", "SIGKILL"],
  ) {
    super();
  }
  kill(signal = "SIGTERM"): boolean {
    this.signals.push(signal);
    if (!this.exitsOn.includes(signal)) return true;
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
  exit(code = 0): void {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

function fixture(
  waitForVite = async () => undefined,
  electronExitSignals: readonly string[] = ["SIGTERM", "SIGKILL"],
) {
  const stage = new Child();
  const vite = new Child();
  const electrons: Child[] = [];
  let build: ((success: boolean) => void) | undefined;
  const exits: number[] = [];
  const supervisor = new ElectronDevelopmentSupervisor({
    startTimeoutMs: 50,
    stopTimeoutMs: 50,
    log: () => undefined,
    setExitCode: (code: number) => exits.push(code),
    spawnStage: () => stage as unknown as ChildProcess,
    spawnVite: () => vite as unknown as ChildProcess,
    waitForVite,
    spawnElectron: () => {
      const child = new Child(electronExitSignals);
      electrons.push(child);
      return child as unknown as ChildProcess;
    },
    watchMain: async (callback: (success: boolean) => void) => {
      build = callback;
      return async () => undefined;
    },
  });
  return { stage, vite, electrons, exits, supervisor, build: () => build! };
}

describe("Electron development supervisor", () => {
  it("does not start Electron until Vite and a main build succeed, then restarts only Electron", async () => {
    const value = fixture();
    const starting = value.supervisor.start();
    value.stage.exit();
    await starting;
    value.build()(false);
    expect(value.electrons).toHaveLength(0);
    value.build()(true);
    expect(value.electrons).toHaveLength(1);
    value.build()(true);
    expect(value.electrons[0]!.signals).toEqual(["SIGTERM"]);
    expect(value.electrons).toHaveLength(2);
  });

  it("cleans managed children when staging fails", async () => {
    const value = fixture();
    const starting = value.supervisor.start();
    value.stage.exit(1);
    await expect(starting).rejects.toThrow("stage:sculptures");
    expect(value.vite.signals).toEqual([]);
    expect(value.exits).toEqual([1]);
  });

  it("cleans Vite when its selected port cannot become ready", async () => {
    const value = fixture(async () => {
      throw new Error("Vite port is occupied.");
    });
    const starting = value.supervisor.start();
    value.stage.exit();
    await expect(starting).rejects.toThrow("occupied");
    expect(value.vite.signals).toEqual(["SIGTERM"]);
    expect(value.exits).toEqual([1]);
  });

  it("stops Vite and Electron after an unexpected Vite exit", async () => {
    const value = fixture();
    const starting = value.supervisor.start();
    value.stage.exit();
    await starting;
    value.build()(true);
    value.vite.exit(1);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    expect(value.electrons[0]!.signals).toEqual(["SIGTERM"]);
    expect(value.exits).toEqual([1]);
  });

  it("uses SIGKILL after a child ignores SIGTERM", async () => {
    const value = fixture(async () => undefined, ["SIGKILL"]);
    const starting = value.supervisor.start();
    value.stage.exit();
    await starting;
    value.build()(true);
    await value.supervisor.stop();
    expect(value.electrons[0]!.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
