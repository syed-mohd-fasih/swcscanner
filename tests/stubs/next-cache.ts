// Outside a Next.js server there is no data cache: call through.
export function unstable_cache<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return fn
}

export function revalidateTag(): void {}
export function refresh(): void {}
