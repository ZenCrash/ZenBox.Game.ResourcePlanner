/** Per-item LRU cache with shared pending reads and bounded batch concurrency. */
export class BatchCache<T extends { id: string }> {
  private entries = new Map<string, { expires: number; value: Promise<T | undefined> }>();
  private jobs: (() => Promise<void>)[] = [];
  private running = 0;

  constructor(
    private read: (ids: string[]) => Promise<T[]>,
    private capacity = 1000,
    private ttl = 300_000,
    private batchSize = 40,
    private concurrency = 4,
  ) {}

  async get(ids: string[], onProgress?: (completed: number, total: number) => void): Promise<T[]> {
    const missing: { id: string; resolve: (value: T | undefined) => void; reject: (error: unknown) => void; value: Promise<T | undefined> }[] = [];
    const values = [...new Set(ids)].map(id => {
      const cached = this.entries.get(id);
      if (cached && cached.expires > Date.now()) {
        this.entries.delete(id);
        this.entries.set(id, cached);
        return cached.value;
      }
      let resolve!: (value: T | undefined) => void;
      let reject!: (error: unknown) => void;
      const value = new Promise<T | undefined>((yes, no) => { resolve = yes; reject = no; });
      this.entries.delete(id);
      this.entries.set(id, { value, expires: Date.now() + this.ttl });
      missing.push({ id, resolve, reject, value });
      return value;
    });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    for (let start = 0; start < missing.length; start += this.batchSize) {
      const batch = missing.slice(start, start + this.batchSize);
      this.jobs.push(async () => {
        const forget = (entry: typeof batch[number]) => {
          if (this.entries.get(entry.id)?.value === entry.value) this.entries.delete(entry.id);
        };
        try {
          const rows = new Map((await this.read(batch.map(entry => entry.id))).map(row => [row.id, row]));
          for (const entry of batch) {
            const row = rows.get(entry.id);
            if (!row) forget(entry);
            entry.resolve(row);
          }
        } catch (error) {
          for (const entry of batch) { forget(entry); entry.reject(error); }
        }
      });
    }
    this.pump();
    let completed = 0;
    onProgress?.(0, values.length);
    const tracked = values.map(value => value.then(result => {
      onProgress?.(++completed, values.length);
      return result;
    }));
    const result: T[] = [];
    for (const value of await Promise.all(tracked)) if (value !== undefined) result.push(value);
    return result;
  }

  private pump() {
    while (this.running < this.concurrency && this.jobs.length) {
      const job = this.jobs.shift()!;
      this.running++;
      void job().finally(() => { this.running--; this.pump(); });
    }
  }
}
