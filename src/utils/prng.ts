/**
 * Simple Linear Congruential Generator for deterministic random numbers
 */
export class PRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive)
  public next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  // Helper method for random range
  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
