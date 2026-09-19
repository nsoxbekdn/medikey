"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { createVault, unlockVault, lockVault, getUnlockedVault, VaultKeys, StoredVaultRecord } from "@/lib/crypto/vault";
import { UserCryptoRow } from "@/lib/db/types";

interface VaultContextValue {
  loading: boolean;
  hasVaultRecord: boolean;
  unlocked: boolean;
  vault: VaultKeys | null;
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

function rowToStoredRecord(row: UserCryptoRow): StoredVaultRecord {
  return {
    publicKeyJwk: row.public_key_jwk,
    wrappedPrivateBundle: row.wrapped_private_bundle,
    wrapIv: row.wrap_iv,
    kdfSalt: row.kdf_salt,
    kdfIterations: row.kdf_iterations,
    kdfAlgorithm: row.kdf_algorithm,
  };
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [storedRecord, setStoredRecord] = useState<UserCryptoRow | null>(null);
  const [vault, setVault] = useState<VaultKeys | null>(getUnlockedVault());

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setStoredRecord(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("user_crypto").select("*").eq("user_id", userData.user.id).maybeSingle();
    setStoredRecord((data as UserCryptoRow | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // One-time fetch of this account's vault record on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const setup = useCallback(async (passphrase: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Not signed in.");
    const record = await createVault(passphrase);
    const { error } = await supabase.from("user_crypto").upsert({
      user_id: userData.user.id,
      public_key_jwk: record.publicKeyJwk,
      wrapped_private_bundle: record.wrappedPrivateBundle,
      wrap_iv: record.wrapIv,
      kdf_salt: record.kdfSalt,
      kdf_iterations: record.kdfIterations,
      kdf_algorithm: record.kdfAlgorithm,
    });
    if (error) throw error;
    setVault(getUnlockedVault());
    await refresh();
  }, [refresh]);

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!storedRecord) throw new Error("No vault found for this account.");
      const v = await unlockVault(passphrase, rowToStoredRecord(storedRecord));
      setVault(v);
    },
    [storedRecord]
  );

  const lock = useCallback(() => {
    lockVault();
    setVault(null);
  }, []);

  return (
    <VaultContext.Provider
      value={{ loading, hasVaultRecord: !!storedRecord, unlocked: !!vault, vault, setup, unlock, lock }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
