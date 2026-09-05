import { createWifiCredentialsClient } from "./WifiCredentialsClient.ts";

export interface WifiNetwork {
  name: string;
  rssi: number;
}
export interface Esp32WifiControlsOptions {
  ssidInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  networkSelect: HTMLSelectElement;
  scanButton: HTMLButtonElement;
  forgetButton: HTMLButtonElement;
  storageStatus: HTMLElement;
  scan(): Promise<WifiNetwork[]>;
  setBusy(busy: boolean): void;
  isBusy(): boolean;
}

export function createEsp32WifiControls(
  options: Esp32WifiControlsOptions,
  store = createWifiCredentialsClient(),
) {
  let revision = 0;
  let passwordSsid = options.ssidInput.value;
  const status = (message: string) => {
    options.storageStatus.textContent = message;
  };
  const save = async () => {
    const ssid = options.ssidInput.value;
    if (!ssid || new TextEncoder().encode(ssid).length > 32) return;
    try {
      await store.save({ ssid, password: options.passwordInput.value });
      status("Wi-Fi details saved on this computer.");
    } catch {
      status("Wi-Fi details could not be saved. Setup can still continue.");
    }
  };
  const changedSsid = () => {
    revision += 1;
    if (passwordSsid !== options.ssidInput.value)
      options.passwordInput.value = "";
    passwordSsid = options.ssidInput.value;
  };
  options.ssidInput.addEventListener("input", () => {
    changedSsid();
    options.networkSelect.value = options.ssidInput.value;
  });
  options.passwordInput.addEventListener("input", () => {
    revision += 1;
  });
  options.ssidInput.addEventListener("change", () => {
    void save();
  });
  options.passwordInput.addEventListener("change", () => {
    void save();
  });
  options.networkSelect.addEventListener("change", () => {
    if (!options.networkSelect.value) {
      options.ssidInput.focus();
      return;
    }
    options.ssidInput.value = options.networkSelect.value;
    changedSsid();
    void save();
  });
  options.forgetButton.addEventListener("click", () => {
    if (options.isBusy()) return;
    revision += 1;
    passwordSsid = "";
    options.ssidInput.value = "";
    options.passwordInput.value = "";
    options.networkSelect.value = "";
    void store
      .forget()
      .then(() => status("Saved Wi-Fi details removed."))
      .catch(() =>
        status("Saved Wi-Fi details could not be removed. Try again."),
      );
  });
  options.scanButton.addEventListener("click", () => {
    if (options.isBusy()) return;
    options.setBusy(true);
    status("Scanning through the connected ESP32. Keep BOOT released.");
    void options
      .scan()
      .then((networks) => {
        options.networkSelect.replaceChildren(
          new Option("Enter a network name below", ""),
        );
        for (const network of networks)
          options.networkSelect.add(
            new Option(`${network.name} (${network.rssi} dBm)`, network.name),
          );
        options.networkSelect.value = options.ssidInput.value;
        if (options.networkSelect.selectedIndex < 0)
          options.networkSelect.selectedIndex = 0;
        status(
          networks.length
            ? `${networks.length} Wi-Fi networks found. Select a network or enter its name.`
            : "No networks found. Enter a network name manually.",
        );
      })
      .catch(() => {
        status(
          "Wi-Fi scan unavailable. The ESP32 must already run WLED with Improv. Enter the network name manually.",
        );
      })
      .finally(() => options.setBusy(false));
  });
  return {
    save,
    async restore() {
      const requestedRevision = revision;
      try {
        const saved = await store.load();
        if (revision !== requestedRevision || options.isBusy() || !saved)
          return;
        options.ssidInput.value = saved.ssid;
        options.passwordInput.value = saved.password;
        passwordSsid = saved.ssid;
        status("Saved Wi-Fi details restored.");
      } catch {
        status("Saved Wi-Fi details are unavailable. Enter them to continue.");
      }
    },
  };
}
