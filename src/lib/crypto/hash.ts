import { bufToHex } from "./encoding";

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const digest = await crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return bufToHex(digest);
}
