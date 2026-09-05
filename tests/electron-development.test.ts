import { describe, expect, it } from "vitest";
import {
  developmentUserDataDirectory,
  resolveElectronRuntime,
} from "../electron/DevelopmentMode.ts";

describe("Electron development runtime", () => {
  it("uses only an explicit loopback Vite origin", () => {
    expect(
      resolveElectronRuntime({
        LOO_UME_ELECTRON_DEVELOPMENT: "1",
        LOO_UME_ELECTRON_DEV_URL: "http://127.0.0.1:5173/editor?ignored=yes",
      }),
    ).toEqual({ development: true, editorUrl: "http://127.0.0.1:5173" });
    expect(() =>
      resolveElectronRuntime({
        LOO_UME_ELECTRON_DEVELOPMENT: "1",
        LOO_UME_ELECTRON_DEV_URL: "https://example.invalid",
      }),
    ).toThrow("loopback");
    expect(() =>
      resolveElectronRuntime(
        {
          LOO_UME_ELECTRON_DEVELOPMENT: "1",
          LOO_UME_ELECTRON_DEV_URL: "http://127.0.0.1:5173",
        },
        true,
      ),
    ).toThrow("packaged");
  });

  it("keeps normal and review user data separate from development data", () => {
    expect(
      developmentUserDataDirectory({
        LOO_UME_ELECTRON_DEVELOPMENT: "1",
        LOO_UME_ELECTRON_DEVELOPMENT_DATA: "/tmp/loo-ume-development",
      }),
    ).toBe("/tmp/loo-ume-development");
    expect(
      developmentUserDataDirectory({
        LOO_UME_ELECTRON_DEVELOPMENT: "1",
        LOO_UME_ELECTRON_DEVELOPMENT_DATA: "relative",
      }),
    ).toBeUndefined();
    expect(
      developmentUserDataDirectory({
        LOO_UME_ELECTRON_DEVELOPMENT_DATA: "/tmp/loo-ume-development",
      }),
    ).toBeUndefined();
  });
});
