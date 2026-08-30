import { describe, expect, it } from "vitest";
import {
  localApplicationRestartCommand,
  localBrowserCommand,
} from "../scripts/local-editor-server.ts";

describe("local editor browser launch", () => {
  it("uses the native macOS opener", () => {
    expect(localBrowserCommand("darwin", {})).toEqual(["/usr/bin/open"]);
  });

  it("uses xdg-open only in a graphical Linux session", () => {
    expect(localBrowserCommand("linux", { DISPLAY: ":0" })).toEqual([
      "/usr/bin/xdg-open",
    ]);
    expect(localBrowserCommand("linux", {})).toBeUndefined();
  });

  it("restarts through the process-owning launcher only for managed installs", () => {
    expect(localApplicationRestartCommand("/application", {
      LOO_UME_MANAGED_LAUNCHER: "1",
    })).toEqual([
      "/bin/sh",
      "/application/scripts/looume.sh",
      "--restart-after-update",
    ]);
    expect(localApplicationRestartCommand("/checkout", {})).toEqual([
      "/bin/sh",
      "/checkout/bootstrap.sh",
      "launch",
    ]);
  });
});
