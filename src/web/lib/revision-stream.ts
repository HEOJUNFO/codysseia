// 연속 번호가 붙은 공개 변경을 순서대로 반영한다. 누락 구간만 한 번에 최대 256개 요청한다.
const REPLAY_BATCH = 256;

export class RevisionStream<Change> {
  #last: number;
  #target: number;
  #requestedEnd = 0;
  #buffer = new Map<number, Change>();
  #failed = false;

  constructor(
    private readonly revisionOf: (change: Change) => number,
    private readonly apply: (change: Change) => void,
    private readonly request: (from: number, to: number) => void,
    private readonly fail: () => void,
    initialRevision = 0,
  ) {
    this.#last = initialRevision;
    this.#target = initialRevision;
  }

  get caughtUp(): boolean {
    return !this.#failed && this.#last >= this.#target;
  }

  reset(revision: number): void {
    this.#last = revision;
    this.#target = revision;
    this.#requestedEnd = 0;
    this.#buffer.clear();
    this.#failed = false;
  }

  catchUp(revision: number): void {
    if (this.#failed || !Number.isInteger(revision) || revision < this.#last) return;
    this.#target = Math.max(this.#target, revision);
    this.#requestMissing();
  }

  accept(change: Change): void {
    if (this.#failed) return;
    const revision = this.revisionOf(change);
    if (!Number.isInteger(revision) || revision < 1) return;
    if (revision <= this.#last) return;
    this.#target = Math.max(this.#target, revision);
    if (revision > this.#last + 1) {
      if (!this.#buffer.has(revision) && this.#buffer.size >= REPLAY_BATCH) {
        this.#failed = true;
        this.fail();
        return;
      }
      this.#buffer.set(revision, change);
      this.#requestMissing();
      return;
    }
    this.#applyNext(change);
    let next = this.#buffer.get(this.#last + 1);
    while (next) {
      this.#buffer.delete(this.#last + 1);
      this.#applyNext(next);
      next = this.#buffer.get(this.#last + 1);
    }
    this.#requestMissing();
  }

  #applyNext(change: Change): void {
    this.apply(change);
    this.#last = this.revisionOf(change);
    if (this.#last >= this.#requestedEnd) this.#requestedEnd = 0;
  }

  #requestMissing(): void {
    if (this.#requestedEnd > this.#last || this.#target <= this.#last) return;
    let nextBuffered = Number.POSITIVE_INFINITY;
    for (const revision of this.#buffer.keys()) {
      if (revision < nextBuffered) nextBuffered = revision;
    }
    const from = this.#last + 1;
    const to = Math.min(this.#target, from + REPLAY_BATCH - 1, nextBuffered - 1);
    if (to < from) return;
    this.#requestedEnd = to;
    this.request(from, to);
  }
}
