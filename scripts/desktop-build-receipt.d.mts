export type DesktopBuildReceiptOptions = Readonly<{
  "--root": string;
  "--receipt": string;
  "--target": string;
  "--commit": string;
}>;

export function createReceipt(
  options: DesktopBuildReceiptOptions,
): Promise<void>;

export function verifyReceipt(
  options: DesktopBuildReceiptOptions,
): Promise<void>;
