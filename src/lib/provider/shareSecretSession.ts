export function shareSecretStorageKey(shareId: string): string {
  return `medikey-share-secret:${shareId}`;
}

export function readSessionShareSecret(shareId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(shareSecretStorageKey(shareId));
}

export function storeSessionShareSecret(shareId: string, secret: string): void {
  window.sessionStorage.setItem(shareSecretStorageKey(shareId), secret);
}

export function clearSessionShareSecret(shareId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(shareSecretStorageKey(shareId));
}

export function chooseShareSecret(fragmentSecret: string | null, sessionSecret: string | null): string | null {
  return fragmentSecret || sessionSecret;
}

