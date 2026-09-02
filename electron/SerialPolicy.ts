const CP2102_VENDOR_ID = "10c4";
const CP2102_PRODUCT_ID = "ea60";

function normalizedUsbId(value: string | number | undefined): string | undefined {
  if (typeof value === "number") return value.toString(16).padStart(4, "0");
  if (typeof value !== "string") return undefined;
  return value.toLowerCase().replace(/^0x/, "").padStart(4, "0");
}

export function isApprovedCp2102(
  port: { vendorId?: string | number; productId?: string | number },
): boolean {
  return normalizedUsbId(port.vendorId) === CP2102_VENDOR_ID &&
    normalizedUsbId(port.productId) === CP2102_PRODUCT_ID;
}
