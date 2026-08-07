// Exact shape classifier for one line direction, precomputed as a lookup table.
//
// A "window" is the 9 cells centred on a candidate point along one direction:
// four cells either side, which is exactly the span any five-in-a-row through
// the centre can reach. Each cell is a base-4 digit (0 empty, 1 self, 2 enemy,
// 3 off-board) and the centre digit is always 0, because the table answers the
// question "what shape do I create by playing my own stone here?".
//
// The table is built with a descending dynamic program: adding one of our own
// stones to a window always increases its numeric code, so every child code is
// already classified by the time the parent is reached. That turns the naturally
// recursive definitions (a 活四 is a shape with two ways to make five, a 活三 is
// a shape that can become a 活四 in one move, ...) into a few hundred thousand
// cheap steps instead of a deep search per lookup.

export const WINDOW_SIZE = 9;
export const WINDOW_CENTER = 4;
export const CODE_COUNT = 4 ** WINDOW_SIZE;

export const CELL_EMPTY = 0;
export const CELL_WALL = 3;

export const PATTERN_NONE = 0;
export const PATTERN_TWO = 1;
export const PATTERN_OPEN_TWO = 2;
export const PATTERN_SLEEP_THREE = 3;
export const PATTERN_OPEN_THREE = 4;
export const PATTERN_FOUR = 5;
export const PATTERN_OPEN_FOUR = 6;
export const PATTERN_FIVE = 7;

export const POW4 = new Int32Array(WINDOW_SIZE);

for (let i = 0; i < WINDOW_SIZE; i += 1) {
  POW4[i] = 4 ** i;
}

function digitAt(code: number, slot: number): number {
  return (code >> (2 * slot)) & 3;
}

// True when placing `self` at the centre completes five (or more) in a row.
// Only runs that contain the centre count: this table describes the threat the
// move itself creates, not unrelated shapes elsewhere on the line.
function makesFive(code: number, self: number): boolean {
  let run = 1;

  for (let slot = WINDOW_CENTER - 1; slot >= 0; slot -= 1) {
    if (digitAt(code, slot) !== self) {
      break;
    }
    run += 1;
  }

  for (let slot = WINDOW_CENTER + 1; slot < WINDOW_SIZE; slot += 1) {
    if (digitAt(code, slot) !== self) {
      break;
    }
    run += 1;
  }

  return run >= 5;
}

function buildTable(self: number): Uint8Array {
  const table = new Uint8Array(CODE_COUNT);

  for (let code = CODE_COUNT - 1; code >= 0; code -= 1) {
    if (digitAt(code, WINDOW_CENTER) !== CELL_EMPTY) {
      continue;
    }

    if (makesFive(code, self)) {
      table[code] = PATTERN_FIVE;
      continue;
    }

    let fiveChildren = 0;
    let hasOpenFourChild = false;
    let hasFourChild = false;
    let hasOpenThreeChild = false;
    let hasSleepThreeChild = false;

    for (let slot = 0; slot < WINDOW_SIZE; slot += 1) {
      if (slot === WINDOW_CENTER || digitAt(code, slot) !== CELL_EMPTY) {
        continue;
      }

      // Child code = the same window with one extra stone of ours at `slot`.
      const child = table[code + self * POW4[slot]];

      if (child === PATTERN_FIVE) {
        fiveChildren += 1;
      } else if (child === PATTERN_OPEN_FOUR) {
        hasOpenFourChild = true;
      } else if (child === PATTERN_FOUR) {
        hasFourChild = true;
      } else if (child === PATTERN_OPEN_THREE) {
        hasOpenThreeChild = true;
      } else if (child === PATTERN_SLEEP_THREE) {
        hasSleepThreeChild = true;
      }
    }

    if (fiveChildren >= 2) {
      table[code] = PATTERN_OPEN_FOUR;
    } else if (fiveChildren === 1) {
      table[code] = PATTERN_FOUR;
    } else if (hasOpenFourChild) {
      table[code] = PATTERN_OPEN_THREE;
    } else if (hasFourChild) {
      table[code] = PATTERN_SLEEP_THREE;
    } else if (hasOpenThreeChild) {
      table[code] = PATTERN_OPEN_TWO;
    } else if (hasSleepThreeChild) {
      table[code] = PATTERN_TWO;
    } else {
      table[code] = PATTERN_NONE;
    }
  }

  return table;
}

let blackTable: Uint8Array | null = null;
let whiteTable: Uint8Array | null = null;

// Two tables (one per colour) instead of re-encoding windows from the other
// side's point of view on every lookup: 256 KB each, built once per thread.
export function getPatternTable(self: number): Uint8Array {
  if (self === 1) {
    if (!blackTable) {
      blackTable = buildTable(1);
    }
    return blackTable;
  }

  if (!whiteTable) {
    whiteTable = buildTable(2);
  }
  return whiteTable;
}
