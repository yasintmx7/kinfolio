/**
 * Seller / buyer display helpers.
 * Never treat a Solana wallet as a "username".
 */

/** Solana base58 pubkey (typically 32–44 chars). */
export function isSolanaAddress(value: string | null | undefined): boolean {
  if (value == null) return false;
  const t = value.trim();
  if (t.length < 32 || t.length > 48) return false;
  // base58 alphabet (no 0, O, I, l)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return false;
  return true;
}

/** Truncate wallet for UI: AbCd…wXyZ */
export function shortWallet(w: string | null | undefined): string | null {
  if (w == null) return null;
  const t = w.trim();
  if (!t) return null;
  if (t.length < 10) return t;
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

/**
 * Real display name only — returns null for empty, #ids, or wallets.
 */
export function sanitizePersonName(
  name: string | null | undefined,
): string | null {
  if (name == null) return null;
  const t = name.trim();
  if (!t) return null;
  if (t.startsWith("#") && /^#\d+$/.test(t)) return null;
  if (isSolanaAddress(t)) return null;
  // Ellipsis short-wallet form (AbCd…wXyZ) is not a username
  if (/^[1-9A-HJ-NP-Za-km-z]{3,6}…[1-9A-HJ-NP-Za-km-z]{3,6}$/.test(t)) {
    return null;
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{3,6}\.\.\.[1-9A-HJ-NP-Za-km-z]{3,6}$/.test(t)) {
    return null;
  }
  return t;
}

export function formatSellerLabel(input: {
  sellerName?: string | null;
  seller?: string | null;
  sellerId?: string | number | null;
  sellerWallet?: string | null;
}): string {
  const name = sanitizePersonName(input.sellerName ?? input.seller);
  if (name) return name;

  const id = input.sellerId;
  if (id != null && String(id).trim() !== "" && /^\d+$/.test(String(id).trim())) {
    return `#${String(id).trim()}`;
  }

  const wallet =
    (input.sellerWallet && isSolanaAddress(input.sellerWallet)
      ? input.sellerWallet
      : null) ??
    (isSolanaAddress(input.seller) ? String(input.seller) : null) ??
    (isSolanaAddress(input.sellerName) ? String(input.sellerName) : null);

  if (wallet) return shortWallet(wallet) || "Seller";
  return "Seller";
}

/** Official listing ids are numeric. Reject sale-document ids. */
export function officialListingId(
  listingId: string | number | null | undefined,
): string | null {
  if (listingId == null || listingId === "") return null;
  const s = String(listingId).trim();
  if (/^\d+$/.test(s)) return s;
  return null;
}
