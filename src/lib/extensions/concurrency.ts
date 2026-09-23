/**
 * Bounded parallelism.
 *
 * Both discovery and upgrades fan out over installed extensions, and the
 * number of those is up to the user. Without a bound, discovery would queue
 * filesystem work for every extension at once on each invocation, and an
 * upgrade would fire one GitHub request per extension at once, which is what
 * secondary rate limits are for.
 */

/** Run `worker` over every item, at most `limit` at a time, in input order. */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = Array.from<R>({ length: items.length })
    let next = 0

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await worker(items[index])
        }
    })

    await Promise.all(runners)
    return results
}
