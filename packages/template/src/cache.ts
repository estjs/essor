export interface CacheConfig {
  maxSize: number;
  ttl?: number;
}

export interface CacheItem<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
}

export class Cache<T> {
  private store = new Map<string, CacheItem<T>>();
  private readonly maxSize: number;
  private readonly ttl?: number;

  constructor(config: CacheConfig) {
    this.maxSize = config.maxSize;
    this.ttl = config.ttl;
  }

  set(key: string, value: T): void {
    this.ensureCapacity();

    this.store.set(key, {
      value,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
  }

  get(key: string): T | undefined {
    const item = this.store.get(key);
    if (!item) return undefined;

    if (this.isExpired(item)) {
      this.store.delete(key);
      return undefined;
    }

    this.updateAccessTime(item);
    return item.value;
  }

  private ensureCapacity(): void {
    if (this.store.size >= this.maxSize) {
      this.evictLRU();
    }
  }

  private isExpired(item: CacheItem<T>): boolean {
    return Boolean(this.ttl && Date.now() - item.timestamp > this.ttl);
  }

  private updateAccessTime(item: CacheItem<T>): void {
    item.lastAccessed = Date.now();
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, item] of this.store.entries()) {
      if (item.lastAccessed < oldestAccess) {
        oldestAccess = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  clear(): void {
    this.store.clear();
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
