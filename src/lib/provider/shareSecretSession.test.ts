import { describe, expect, it } from "vitest";
import { chooseShareSecret, shareSecretStorageKey } from "./shareSecretSession";

describe("provider share secret session", () => {
  it("uses the URL fragment before a stored tab secret", () => {
    expect(chooseShareSecret("new-fragment", "stored-secret")).toBe("new-fragment");
  });

  it("uses the tab secret after a fragment has been removed for refresh", () => {
    expect(chooseShareSecret(null, "stored-secret")).toBe("stored-secret");
  });

  it("reports a missing secret after close and wipe", () => {
    expect(chooseShareSecret(null, null)).toBeNull();
  });

  it("scopes storage by share id", () => {
    expect(shareSecretStorageKey("share-123")).toBe("medikey-share-secret:share-123");
  });
});

