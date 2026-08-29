import { describe, expect, it } from "vitest";
import { localBrowserCommand } from "../scripts/local-editor-server.ts";

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
});
