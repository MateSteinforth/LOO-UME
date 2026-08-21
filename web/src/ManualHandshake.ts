interface ManualTokenCrypto {
  randomUUID?: () => string;
  getRandomValues(values: Uint32Array): Uint32Array;
}

export function createManualHandshakeToken(
  cryptoApi: ManualTokenCrypto = globalThis.crypto,
): string {
  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return [...cryptoApi.getRandomValues(new Uint32Array(4))]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}
