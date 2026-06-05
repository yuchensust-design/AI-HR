import { LRUCache } from "lru-cache";
import { config } from "./config.js";

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const listCache = new LRUCache<string, Entry<unknown>>({ max: 500 });
const detailCache = new LRUCache<string, Entry<unknown>>({ max: 1000 });

export function cacheList<T>(key: string, value: T): void {
  listCache.set(key, {
    value,
    expiresAt: Date.now() + config.listCacheTtlMs,
  });
}

export function readList<T>(key: string): T | null {
  const e = listCache.get(key) as Entry<T> | undefined;
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    listCache.delete(key);
    return null;
  }
  return e.value;
}

export function cacheDetail<T>(key: string, value: T): void {
  detailCache.set(key, {
    value,
    expiresAt: Date.now() + config.detailCacheTtlMs,
  });
}

export function readDetail<T>(key: string): T | null {
  const e = detailCache.get(key) as Entry<T> | undefined;
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    detailCache.delete(key);
    return null;
  }
  return e.value;
}
