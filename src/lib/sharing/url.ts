export function buildShareUrl(origin: string, shareId: string, secretB64Url: string): string {
  return `${origin}/share/${shareId}#${secretB64Url}`;
}

// The fragment is never sent in the HTTP request; read it client-side only.
export function readFragmentSecret(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  return hash.startsWith("#") ? hash.slice(1) : null;
}
