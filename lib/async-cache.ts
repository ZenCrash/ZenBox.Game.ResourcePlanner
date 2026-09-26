/** Bounded LRU cache that shares in-flight reads and never caches failures. */
export class AsyncCache<T> {
  private entries = new Map<string, { value: Promise<T>; expires: number }>();

  constructor(
    private capacity: number,
    private ttl = 300_000,
  ) {}

  get(key: string, read: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expires > Date.now()) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.value;
    }
    const value = Promise.resolve().then(read);
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttl });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    void value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }
}
