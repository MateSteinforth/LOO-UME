import { createSocket } from "node:dgram";
import { expect, test } from "@playwright/test";

function artDmx(universe: number, data: Uint8Array, sequence: number): Uint8Array {
  const packet = new Uint8Array(18 + data.byteLength);
  packet.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]);
  packet.set([0x00, 0x50, 0x00, 0x0e, sequence, 0x00], 8);
  packet[14] = universe & 0xff;
  packet[15] = universe >> 8;
  packet[16] = data.byteLength >> 8;
  packet[17] = data.byteLength & 0xff;
  packet.set(data, 18);
  return packet;
}

async function sendFlagshipFrame(sequence: number): Promise<void> {
  const socket = createSocket("udp4");
  try {
    for (let universe = 1; universe <= 16; universe += 1) {
      const pixelCount = universe === 16 ? 74 : 170;
      const data = new Uint8Array(pixelCount * 3);
      for (let offset = 0; offset < data.byteLength; offset += 3) {
        data.set([universe * 8, 255 - universe * 8, universe], offset);
      }
      await new Promise<void>((resolve, reject) => {
        socket.send(artDmx(universe, data, sequence), 6454, "127.0.0.1", (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    socket.close();
  }
}

test("previews a complete loopback MadMapper Art-Net frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#pipeline-status")).toContainText(
    "No authoring surface is referenced",
  );
  const status = page.locator("#madmapper-preview-status");
  await expect(page.locator("#madmapper-preview")).toHaveCount(0);
  await expect(status).toContainText("Waiting for Art-Net");
  await expect.poll(() => page.evaluate(async () =>
    (await fetch("./api/artnet-preview/status").then((response) => response.json()) as {
      active: boolean;
    }).active
  )).toBe(true);

  await sendFlagshipFrame(12);
  await expect(status).toContainText("16 universes");
  await expect(status).toContainText("0 incomplete");
  await expect(status).toContainText("0 rejected");
  await expect(status).toContainText("Signal timeout", { timeout: 2_500 });
});
