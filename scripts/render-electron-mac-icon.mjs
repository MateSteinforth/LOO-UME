import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ICON_FILES = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

async function assertTransparentCorners(path, size) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size || info.channels !== 4) {
    throw new Error(`Icon ${path} does not have the required RGBA size.`);
  }
  const alphaAt = (x, y) => data[(y * size + x) * info.channels + 3];
  const corners = [
    alphaAt(0, 0),
    alphaAt(size - 1, 0),
    alphaAt(0, size - 1),
    alphaAt(size - 1, size - 1),
  ];
  if (corners.some((alpha) => alpha !== 0)) {
    throw new Error(`Icon ${path} has an opaque corner.`);
  }
  if (alphaAt(Math.floor(size / 2), Math.floor(size / 2)) === 0) {
    throw new Error(`Icon ${path} has a transparent center.`);
  }
}

export async function renderElectronMacIcon(source, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  for (const [size, name] of ICON_FILES) {
    const output = `${outputDirectory}/${name}`;
    await sharp(source, { density: 144 })
      .resize(size, size, { fit: "fill" })
      .png()
      .toFile(output);
    await assertTransparentCorners(output, size);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , source, outputDirectory] = process.argv;
  if (!source || !outputDirectory) {
    throw new Error("Use: node scripts/render-electron-mac-icon.mjs SOURCE OUTPUT_DIRECTORY");
  }
  await renderElectronMacIcon(source, outputDirectory);
}
