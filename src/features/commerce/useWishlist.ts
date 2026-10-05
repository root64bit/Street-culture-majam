'use client';

import { useEffect, useState } from 'react';
const STORAGE_KEY = 'sc_wishlist_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function storedWishlist(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && UUID.test(id)))].slice(0, 100) : [];
  } catch {
    return [];
  }
}

async function updateWishlist(body: object): Promise<boolean> {
  try {
    const response = await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useWishlist() {
  const [saved, setSaved] = useState<string[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const guestIds = storedWishlist();
      try {
        const response = await fetch('/api/wishlist', { cache: 'no-store' });
        if (!response.ok) throw new Error('Wishlist unavailable');
        const result = await response.json() as { authenticated: boolean; productIds: string[] };
        if (result.authenticated) {
          const merged = guestIds.length ? await updateWishlist({ action: 'merge', productIds: guestIds }) : true;
          const ids = merged ? [...new Set([...result.productIds, ...guestIds])] : result.productIds;
          if (!cancelled) {
            setSaved(ids);
            setAuthenticated(true);
            if (merged) localStorage.removeItem(STORAGE_KEY);
          }
        } else if (!cancelled) {
          setSaved(guestIds);
          setAuthenticated(false);
        }
      } catch {
        if (!cancelled) {
          setSaved(guestIds);
          setAuthenticated(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function toggle(productId: string) {
    if (authenticated === null || !UUID.test(productId)) return;
    const wasSaved = saved.includes(productId);
    setSaved((current) => wasSaved ? current.filter((id) => id !== productId) : [...current, productId]);
    if (!authenticated) {
      const next = wasSaved ? saved.filter((id) => id !== productId) : [...saved, productId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return;
    }
    const ok = await updateWishlist({ action: wasSaved ? 'remove' : 'add', productId });
    if (!ok) {
      setSaved((current) => wasSaved ? [...current, productId] : current.filter((id) => id !== productId));
    }
  }

  return { saved, toggle };
}
