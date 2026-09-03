import { createSocket } from "node:dgram";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDdpPreviewHandler,
  type DdpPreviewHandler,
} from "../scripts/ddp-preview-handler.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function ddp(data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(10 + data.byteLength);
  packet.set([0x41, 1, 0x0b, 0x01]);
  new DataView(packet.buffer).setUint16(8, data.byteLength, false);
  packet.set(data, 10);
  return packet;
}

async function fixtureServer(): Promise<{ url: string; handler: DdpPreviewHandler }> {
  const handler = createDdpPreviewHandler({ udpPort: 0 });
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

describe("DDP preview handler", () => {
  it("streams one complete logical RGB frame from UDP", async () => {
    const fixture = await fixtureServer();
    const stream = await fetch(
      `${fixture.url}api/ddp-preview/stream?pixels=2&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-DDP-Preview": "1" } },
    );
    expect(stream.status).toBe(200);
    const status = fixture.handler.status();
    expect(status.bindAddress).toBe("0.0.0.0");
    const socket = createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      socket.send(
        ddp(Uint8Array.from([1, 2, 3, 4, 5, 6])),
        status.port,
        "127.0.0.1",
        (error) => error ? reject(error) : resolve(),
      );
    });
    socket.close();
    const reader = stream.body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value?.slice(0, 4)).toEqual(Uint8Array.from([0x4c, 0x55, 0x44, 0x44]));
    expect(value?.slice(28)).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6]));
    await reader.cancel();
  });

  it("requires one valid mapping identity and one active stream", async () => {
    const fixture = await fixtureServer();
    const invalid = await fetch(
      `${fixture.url}api/ddp-preview/stream?pixels=2&fingerprint=nope`,
      { headers: { "X-LOO-UME-DDP-Preview": "1" } },
    );
    expect(invalid.status).toBe(400);
    const first = await fetch(
      `${fixture.url}api/ddp-preview/stream?pixels=2&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-DDP-Preview": "1" } },
    );
    const second = await fetch(
      `${fixture.url}api/ddp-preview/stream?pixels=2&fingerprint=73b36d49`,
      { headers: { "X-LOO-UME-DDP-Preview": "1" } },
    );
    expect(second.status).toBe(409);
    await first.body?.cancel();
  });
});
