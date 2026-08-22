function responseLocation(response: Response): string {
  return response.url || "the requested URL";
}

export async function readJsonResponse(
  response: Response,
  description: string,
): Promise<unknown> {
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown;
  } catch {
    const isHtml = /^\s*(?:<!doctype\s+html|<html\b)/i.test(body);
    if (isHtml) {
      throw new Error(
        `${description} returned an HTML page from ${responseLocation(response)} ` +
          "instead of JSON. Restart the local preview if staged project files changed, then try again.",
      );
    }
    throw new Error(
      `${description} returned invalid JSON from ${responseLocation(response)}.`,
    );
  }
}
