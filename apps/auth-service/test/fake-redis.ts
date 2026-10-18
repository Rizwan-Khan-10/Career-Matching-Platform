/** Tiny in-memory stand-in for the ioredis calls the auth-service uses. */
export class FakeRedis {
  store = new Map<string, string>();
  ttls = new Map<string, number>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, _ex?: string, seconds?: number) {
    this.store.set(key, value);
    if (seconds) this.ttls.set(key, seconds);
    return 'OK';
  }

  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) removed++;
      this.ttls.delete(key);
    }
    return removed;
  }

  async incr(key: string) {
    const next = parseInt(this.store.get(key) ?? '0', 10) + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number) {
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, seconds);
    return 1;
  }

  async ttl(key: string) {
    if (!this.store.has(key)) return -2;
    return this.ttls.get(key) ?? -1;
  }

  /** Pages of 2 keys; the cursor is the last key seen, so deleting between pages is safe (like real SCAN). */
  async scan(cursor: string, _match: string, pattern: string): Promise<[string, string[]]> {
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const all = [...this.store.keys()].filter((k) => regex.test(k)).sort();
    const remaining = cursor === '0' ? all : all.filter((k) => k > cursor);
    const page = remaining.slice(0, 2);
    return [remaining.length > 2 ? page[page.length - 1] : '0', page];
  }
}