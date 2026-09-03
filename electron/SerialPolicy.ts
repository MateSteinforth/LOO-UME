const CP2102_VENDOR_ID = "10c4";
const CP2102_PRODUCT_ID = "ea60";

function normalizedUsbId(value: string | number | undefined): string | undefined {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return undefined;
    return value.toString(16).padStart(4, "0");
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  const explicitHex = normalized.startsWith("0x");
  const digits = explicitHex ? normalized.slice(2) : normalized;
  const radix = explicitHex || /[a-f]/.test(digits) ? 16 : 10;
  if (!(radix === 16 ? /^[0-9a-f]+$/ : /^[0-9]+$/).test(digits)) {
    return undefined;
  }
  const parsed = Number.parseInt(digits, radix);
  if (parsed < 0 || parsed > 0xffff) return undefined;
  return parsed.toString(16).padStart(4, "0");
}

export function isApprovedCp2102(
  port: { vendorId?: string | number; productId?: string | number },
): boolean {
  return normalizedUsbId(port.vendorId) === CP2102_VENDOR_ID &&
    normalizedUsbId(port.productId) === CP2102_PRODUCT_ID;
}
