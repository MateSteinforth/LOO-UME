import { describe, expect, it } from "vitest";
import { createManualHandshakeToken } from "../web/src/ManualHandshake.ts";

describe("wiring manual handshake token", () => {
  it("uses randomUUID when the secure-context API is available", () => {
    expect(createManualHandshakeToken({
      randomUUID: () => "secure-context-uuid",
      getRandomValues: (values) => values,
    })).toBe("secure-context-uuid");
  });

  it("uses getRandomValues when randomUUID is unavailable on an HTTP LAN", () => {
    expect(createManualHandshakeToken({
      getRandomValues: (values) => {
        values.set([0, 1, 0x1234abcd, 0xffffffff]);
        return values;
      },
    })).toBe("00000000000000011234abcdffffffff");
  });
});
