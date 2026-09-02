export interface QuitCapableApplication {
  quit(): void;
}

export function quitAfterLastWindowCloses(
  application: QuitCapableApplication,
): void {
  application.quit();
}
