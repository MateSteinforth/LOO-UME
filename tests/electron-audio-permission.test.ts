import { describe, expect, it } from "vitest";
import {
  allowsEditorAudioPermissionCheck,
  allowsEditorAudioPermissionRequest,
} from "../electron/AudioPermission.ts";

const editorUrl = "http://127.0.0.1:4175/editor";
const editorOrigin = "http://127.0.0.1:4175";

describe("Electron audio permission policy", () => {
  it("allows only an audio check from the editor main frame", () => {
    expect(
      allowsEditorAudioPermissionCheck(
        {
          details: {
            isMainFrame: true,
            mediaType: "audio",
            requestingUrl: `${editorOrigin}/editor`,
            securityOrigin: editorOrigin,
          },
          permission: "media",
          requestingOrigin: editorOrigin,
        },
        editorUrl,
      ),
    ).toBe(true);
  });

  it.each([
    { isMainFrame: false, mediaType: "audio", permission: "media" },
    { isMainFrame: true, mediaType: "video", permission: "media" },
    { isMainFrame: true, mediaType: "unknown", permission: "media" },
    { isMainFrame: true, mediaType: "audio", permission: "serial" },
  ])("rejects a non-audio or non-main-frame check", (input) => {
    expect(
      allowsEditorAudioPermissionCheck(
        {
          details: {
            ...input,
            requestingUrl: editorUrl,
            securityOrigin: editorOrigin,
          },
          permission: input.permission,
          requestingOrigin: editorOrigin,
        },
        editorUrl,
      ),
    ).toBe(false);
  });

  it("rejects a foreign check origin", () => {
    expect(
      allowsEditorAudioPermissionCheck(
        {
          details: {
            isMainFrame: true,
            mediaType: "audio",
            requestingUrl: "https://example.invalid/editor",
            securityOrigin: "https://example.invalid",
          },
          permission: "media",
          requestingOrigin: "https://example.invalid",
        },
        editorUrl,
      ),
    ).toBe(false);
  });

  it.each([
    ["audio", true],
    ["video", false],
    ["audio and video", false],
    ["no media type", false],
  ] as const)("allows %s requests only when safe", (kind, allowed) => {
    const mediaTypes =
      kind === "audio"
        ? ["audio"]
        : kind === "video"
          ? ["video"]
          : kind === "audio and video"
            ? ["audio", "video"]
            : undefined;
    expect(
      allowsEditorAudioPermissionRequest(
        {
          details: {
            isMainFrame: true,
            mediaTypes,
            requestingUrl: editorUrl,
            securityOrigin: editorOrigin,
          },
          permission: "media",
          webContentsUrl: editorUrl,
        },
        editorUrl,
      ),
    ).toBe(allowed);
  });

  it("rejects a foreign renderer request", () => {
    expect(
      allowsEditorAudioPermissionRequest(
        {
          details: {
            isMainFrame: true,
            mediaTypes: ["audio"],
            requestingUrl: editorUrl,
            securityOrigin: editorOrigin,
          },
          permission: "media",
          webContentsUrl: "https://example.invalid/editor",
        },
        editorUrl,
      ),
    ).toBe(false);
  });
});
