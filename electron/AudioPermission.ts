export interface AudioPermissionCheck {
  details: {
    isMainFrame: boolean;
    mediaType?: string;
    requestingUrl?: string;
    securityOrigin?: string;
  };
  permission: string;
  requestingOrigin: string;
}

export interface AudioPermissionRequest {
  details: {
    isMainFrame: boolean;
    mediaTypes?: readonly string[];
    requestingUrl: string;
    securityOrigin?: string;
  };
  permission: string;
  webContentsUrl: string;
}

function hasEditorOrigin(
  value: string | undefined,
  editorUrl: string | undefined,
): boolean {
  if (!value || !editorUrl) return false;
  try {
    return new URL(value).origin === new URL(editorUrl).origin;
  } catch {
    return false;
  }
}

/** Allow audio input only from the trusted editor main frame. */
export function allowsEditorAudioPermissionCheck(
  request: AudioPermissionCheck,
  editorUrl: string | undefined,
): boolean {
  return (
    request.permission === "media" &&
    request.details.isMainFrame &&
    request.details.mediaType === "audio" &&
    hasEditorOrigin(request.requestingOrigin, editorUrl) &&
    hasEditorOrigin(request.details.requestingUrl, editorUrl) &&
    hasEditorOrigin(request.details.securityOrigin, editorUrl)
  );
}

/** Allow a media request only when it asks for one audio input. */
export function allowsEditorAudioPermissionRequest(
  request: AudioPermissionRequest,
  editorUrl: string | undefined,
): boolean {
  return (
    request.permission === "media" &&
    request.details.isMainFrame &&
    request.details.mediaTypes?.length === 1 &&
    request.details.mediaTypes[0] === "audio" &&
    hasEditorOrigin(request.webContentsUrl, editorUrl) &&
    hasEditorOrigin(request.details.requestingUrl, editorUrl) &&
    hasEditorOrigin(request.details.securityOrigin, editorUrl)
  );
}
