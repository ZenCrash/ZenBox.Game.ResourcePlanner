/** Yield a task, rather than a microtask, so input and painting can run. */
export function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
}

export async function runCooperatively<T>(work: Generator<void, T>, cancelled: () => boolean = () => false): Promise<T> {
  let deadline = performance.now() + 8;
  while (true) {
    if (cancelled()) throw new Error("Diagram load superseded");
    const next = work.next();
    if (next.done) return next.value;
    if (performance.now() >= deadline) {
      await yieldToBrowser();
      deadline = performance.now() + 8;
    }
  }
}

export async function mapCooperatively<T, U>(items: T[], map: (item: T) => U, cancelled: () => boolean): Promise<U[]> {
  function* work(): Generator<void, U[]> {
    const values: U[] = [];
    for (const item of items) { values.push(map(item)); yield; }
    return values;
  }
  return runCooperatively(work(), cancelled);
}
