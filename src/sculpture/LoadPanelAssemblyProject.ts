import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  loadPanelAssemblyProject,
  type PanelAssemblyProject,
} from "./PanelAssembly.ts";

/** Loads a sculpture and its project-relative panel-profile JSON reference. */
export async function loadPanelAssemblyProjectFromFile(
  sculpturePath: string,
  rootDirectory: string = process.cwd(),
): Promise<PanelAssemblyProject> {
  const absoluteSculpturePath = resolve(rootDirectory, sculpturePath);
  const sculptureInput: unknown = JSON.parse(
    await readFile(absoluteSculpturePath, "utf8"),
  );
  return loadPanelAssemblyProject(
    sculptureInput,
    relative(rootDirectory, absoluteSculpturePath),
    async (reference) =>
      JSON.parse(
        await readFile(
          resolve(dirname(absoluteSculpturePath), reference.source),
          "utf8",
        ),
      ) as unknown,
  );
}
