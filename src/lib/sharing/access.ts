export interface AccessItemIdentity {
  itemId: string;
  storagePath: string;
}

// A prepared URL may be returned only for the exact item set re-authorized by
// the atomic claim. This closes the prepare/claim race without proxying blobs.
export function sameAccessItems(prepared: AccessItemIdentity[], claimed: AccessItemIdentity[]): boolean {
  if (prepared.length !== claimed.length) return false;
  const identities = (items: AccessItemIdentity[]) =>
    items.map((item) => `${item.itemId}\u0000${item.storagePath}`).sort();
  const left = identities(prepared);
  const right = identities(claimed);
  return left.every((value, index) => value === right[index]);
}
