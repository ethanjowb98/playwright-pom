/** Name suffixes as seeded: out of order, so an unsorted response cannot pass a sort test. */
export const SORT_SEED_SUFFIXES = ['Charlie', 'Alpha', 'Bravo'] as const;

/** Each sort order with the suffixes in the order it must list them (shared by the API and UI specs). */
export const SORT_CASES = [
  { sort: 'asc', expected: ['Alpha', 'Bravo', 'Charlie'] },
  { sort: 'desc', expected: ['Charlie', 'Bravo', 'Alpha'] },
] as const;
