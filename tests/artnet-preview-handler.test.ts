import { createSocket } from "node:dgram";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createArtNetPreviewHandler,
  type ArtNetPreviewHandler,
} from "../scripts/artnet-preview-handler.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

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

async function fixtureServer(udpPort = 0): Promise<{
  url: string;
  handler: ArtNetPreviewHandler;
}> {
  const handler = createArtNetPreviewHandler({ udpPort });
  const server = createServer((request, response) => {
    void handler.handle(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  cleanups.push(async () => {
    await handler.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${port}/`, handler };
}

async function sendUdp(address: string, port: number, packets: Uint8Array[]): Promise<void> {
  const socket = createSocket("udp4");
  try {
    for (const packet of packets) {
      await new Promise<void>((resolve, reject) => {
        socket.send(packet, port, address, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    socket.close();
  }
}

describe("Art-Net preview handler", () => {
  it("streams one complete physical RGB frame from loopback UDP", async () => {
    const fixture = await fixtureServer();
    const stream = await fetch(
      `${fixture.url}api/artnet-preview/stream?pixels=192&startUniverse=1&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-ArtNet-Preview": "1" } },
    );
    expect(stream.status).toBe(200);
    const status = await fetch(`${fixture.url}api/artnet-preview/status`).then(
      (response) => response.json(),
    ) as { active: boolean; bindAddress: string; port: number };
    expect(status.active).toBe(true);
    expect(status.bindAddress).toBe("127.0.0.1");
    await sendUdp(status.bindAddress, status.port, [
      artDmx(2, new Uint8Array(66).fill(22), 7),
      artDmx(1, new Uint8Array(510).fill(11), 7),
    ]);
    const reader = stream.body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value?.slice(0, 4)).toEqual(Uint8Array.from([0x4c, 0x55, 0x4d, 0x46]));
    const view = new DataView(value!.buffer, value!.byteOffset, value!.byteLength);
    expect(view.getUint8(4)).toBe(1);
    expect(view.getUint8(5)).toBe(7);
    expect(view.getUint16(6, false)).toBe(2);
    expect(view.getUint32(24, false)).toBe(576);
    expect(value![28]).toBe(11);
    expect(value![28 + 510]).toBe(22);
    await reader.cancel();
  });

  it("coexists with a MadMapper socket on the primary loopback address", async () => {
    const madMapperSocket = createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((resolve, reject) => {
      madMapperSocket.once("error", reject);
      madMapperSocket.bind(0, "127.0.0.1", resolve);
    });
    cleanups.push(async () => {
      await new Promise<void>((resolve) => madMapperSocket.close(() => resolve()));
    });
    const udpPort = (madMapperSocket.address() as AddressInfo).port;
    const fixture = await fixtureServer(udpPort);
    const stream = await fetch(
      `${fixture.url}api/artnet-preview/stream?pixels=2&startUniverse=1&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-ArtNet-Preview": "1" } },
    );
    expect(stream.status).toBe(200);
    const status = fixture.handler.status();
    expect(status.bindAddress).toBe("127.0.0.1");
    expect(status.port).toBe(udpPort);
    await new Promise<void>((resolve, reject) => {
      madMapperSocket.send(
        artDmx(1, Uint8Array.from([1, 2, 3, 4, 5, 6]), 7),
        status.port,
        status.bindAddress,
        (error) => {
          if (error) reject(error);
          else resolve();
        },
      );
    });
    const reader = stream.body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value?.slice(28)).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6]));
    await reader.cancel();
  });

  it("requires a valid mapping fingerprint and only one active stream", async () => {
    const fixture = await fixtureServer();
    const invalid = await fetch(
      `${fixture.url}api/artnet-preview/stream?pixels=192&fingerprint=nope`,
      { headers: { "X-LOO-UME-ArtNet-Preview": "1" } },
    );
    expect(invalid.status).toBe(400);

    const first = await fetch(
      `${fixture.url}api/artnet-preview/stream?pixels=192&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-ArtNet-Preview": "1" } },
    );
    const second = await fetch(
      `${fixture.url}api/artnet-preview/stream?pixels=192&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-ArtNet-Preview": "1" } },
    );
    expect(second.status).toBe(409);
    await first.body?.cancel();
  });
});
