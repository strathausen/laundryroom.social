/**
 * The firehose events this worker causes on the group pds, counted over the
 * last hour. The bsky.network relay takes 2,600 events an hour and 21,000 a
 * day per pds host, for every group on pds.lndry.social together; one group
 * (or one user with many groups) must not use that up and get the whole
 * host throttled. So jobs that put something on the network wait when the
 * budget is spent; jobs that take something off it never wait, but count.
 *
 * Kept in memory: the worker is one process (two for a minute during a
 * deploy), and a restart forgets at most an hour.
 */
export class NetworkBudget {
  /** when each counted event happened (ms), oldest first */
  private readonly events: number[] = [];

  constructor(
    /** events allowed per rolling hour */
    readonly perHour: number,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(): void {
    const since = this.now() - 3_600_000;
    while (this.events.length > 0 && (this.events[0] ?? 0) <= since) {
      this.events.shift();
    }
  }

  /** Whether `count` more events fit into the last hour now. */
  fits(count: number): boolean {
    this.prune();
    return this.events.length + count <= this.perHour;
  }

  /** Counts `count` events that happened just now. */
  record(count: number): void {
    const at = this.now();
    for (let i = 0; i < count; i++) this.events.push(at);
  }

  /** Seconds until `count` more events fit (at least 1). */
  secondsUntilFits(count: number): number {
    this.prune();
    const excess = this.events.length + count - this.perHour;
    if (excess <= 0) return 1;
    const freedAt = (this.events[excess - 1] ?? this.now()) + 3_600_000;
    return Math.max(1, Math.ceil((freedAt - this.now()) / 1000));
  }
}
