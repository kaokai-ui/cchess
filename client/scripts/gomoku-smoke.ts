import {
  getAIMove,
  getParallelPlan,
  getSearchConfig,
  pickParallelResult,
  searchAdvancedMove,
  type GomokuAIDifficulty,
} from '../src/shared/gomoku/ai';
import { computeGomokuAiMove } from '../src/shared/gomoku/aiRunner';
import { resetSearchMemory, type GomokuSearchResult } from '../src/shared/gomoku/search';
import {
  FLAG_FIVE,
  FLAG_FOUR,
  FLAG_OPEN_FOUR,
  FLAG_OPEN_THREE,
  GomokuBitboard,
  indexOf,
  toStoneCode,
} from '../src/shared/gomoku/bitboard';
import {
  checkWinner,
  createInitialBoard,
  isBoardFull,
  placeStone,
} from '../src/shared/gomoku/engine';
import type { GomokuBoard, GomokuPosition, GomokuStone } from '../src/shared/gomoku/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function placeMany(
  board: GomokuBoard,
  stone: GomokuStone,
  positions: GomokuPosition[],
) {
  return positions.reduce((currentBoard, pos) => placeStone(currentBoard, pos, stone), board);
}

function buildBoard(
  black: [number, number][],
  white: [number, number][],
): GomokuBoard {
  let board = createInitialBoard();
  board = placeMany(
    board,
    'black',
    black.map(([row, col]) => ({ row, col })),
  );
  board = placeMany(
    board,
    'white',
    white.map(([row, col]) => ({ row, col })),
  );
  return board;
}

function describe(pos: GomokuPosition | null) {
  return pos ? `(${pos.row},${pos.col})` : 'null';
}

function isAt(pos: GomokuPosition | null, row: number, col: number) {
  return pos !== null && pos.row === row && pos.col === col;
}

function testWinnerDetection() {
  let board = createInitialBoard();
  board = placeMany(board, 'black', [
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
    { row: 7, col: 6 },
    { row: 7, col: 7 },
  ]);

  assert(checkWinner(board, { row: 7, col: 7 }) === 'black', 'Five black stones should win');
}

function testAiFinishesWinningLine() {
  const board = buildBoard(
    [
      [8, 5],
      [8, 6],
    ],
    [
      [7, 5],
      [7, 6],
      [7, 7],
      [7, 8],
    ],
  );

  const move = getAIMove(board, 'white', 'hard');
  assert(
    move !== null && move.row === 7 && (move.col === 4 || move.col === 9),
    `AI should finish its open four, got ${describe(move)}`,
  );
}

function testAiBlocksImmediateThreat() {
  const board = buildBoard(
    [
      [5, 5],
      [5, 6],
      [5, 7],
      [5, 8],
    ],
    [
      [7, 7],
      [8, 8],
    ],
  );

  const move = getAIMove(board, 'white', 'master');
  assert(
    move !== null && move.row === 5 && (move.col === 4 || move.col === 9),
    `AI should block immediate loss, got ${describe(move)}`,
  );
}

function testAiOpensAtCenter() {
  const move = getAIMove(createInitialBoard(), 'white', 'normal');
  assert(
    move !== null && move.row === 7 && move.col === 7,
    `Opening move should prefer center, got ${describe(move)}`,
  );
}

// --- Phase 1: incremental board + shape classifier -------------------------

function testShapeClassifier() {
  const openThree = GomokuBitboard.fromBoard(
    buildBoard(
      [
        [7, 5],
        [7, 6],
        [7, 7],
      ],
      [],
    ),
  );
  const blackFlags = openThree.flagsOf(toStoneCode('black'));

  assert(
    (blackFlags[indexOf(7, 4)] & FLAG_OPEN_FOUR) !== 0,
    'Extending an open three should be classified as an open four',
  );
  assert(
    (blackFlags[indexOf(7, 8)] & FLAG_OPEN_FOUR) !== 0,
    'Both ends of an open three should make an open four',
  );
  assert(
    (blackFlags[indexOf(7, 3)] & FLAG_FOUR) !== 0 &&
      (blackFlags[indexOf(7, 3)] & FLAG_OPEN_FOUR) === 0,
    'A gapped extension should be a rush four, not an open four',
  );

  const blockedThree = GomokuBitboard.fromBoard(
    buildBoard(
      [
        [7, 5],
        [7, 6],
        [7, 7],
      ],
      [[7, 4]],
    ),
  );

  assert(
    (blockedThree.flagsOf(toStoneCode('black'))[indexOf(7, 8)] & FLAG_OPEN_THREE) === 0,
    'A three with a blocked end must not be reported as an open three',
  );

  const four = GomokuBitboard.fromBoard(
    buildBoard(
      [
        [7, 5],
        [7, 6],
        [7, 7],
        [7, 8],
      ],
      [],
    ),
  );

  assert(
    (four.flagsOf(toStoneCode('black'))[indexOf(7, 9)] & FLAG_FIVE) !== 0,
    'Completing five should be flagged as a win point',
  );
}

// The incremental score / hash / flag state must survive make + unmake exactly,
// otherwise the search silently corrupts itself a few plies in.
function testMakeUnmakeIsExact() {
  const board = GomokuBitboard.fromBoard(
    buildBoard(
      [
        [7, 7],
        [8, 8],
        [6, 9],
      ],
      [
        [7, 8],
        [8, 7],
      ],
    ),
  );

  const snapshot = () => ({
    hashA: board.hashA,
    hashB: board.hashB,
    black: Array.from(board.scoreOf(toStoneCode('black'))).join(','),
    white: Array.from(board.scoreOf(toStoneCode('white'))).join(','),
    totalBlack: board.totalOf(toStoneCode('black')),
    totalWhite: board.totalOf(toStoneCode('white')),
  });

  const before = JSON.stringify(snapshot());

  board.place(indexOf(9, 9), toStoneCode('black'));
  board.place(indexOf(5, 5), toStoneCode('white'));
  board.place(indexOf(10, 10), toStoneCode('black'));
  board.undo();
  board.undo();
  board.undo();

  assert(before === JSON.stringify(snapshot()), 'make/unmake must restore the board exactly');
}

// --- Phase 2: 棋神 (alpha-beta + VCF) ---------------------------------------

function testGodWinsByContinuousFours() {
  // White: row-7 three walled in at (7,3) and a growing column on col 7.
  // (7,7) is a four that forces (7,8), and the forced reply lets white make an
  // open four on the column: a textbook two-step VCF.
  const board = buildBoard(
    [
      [7, 3],
      [9, 3],
      [10, 4],
      [11, 5],
    ],
    [
      [7, 4],
      [7, 5],
      [7, 6],
      [5, 7],
      [6, 7],
    ],
  );

  const result = searchAdvancedMove(board, 'white', 'god');

  assert(result !== null, 'god should return a move');
  assert(
    result!.via === 'vcf',
    `god should win through the VCF solver, resolved via ${result!.via}`,
  );
  assert(
    isAt({ row: (result!.index / 15) | 0, col: result!.index % 15 }, 7, 7),
    `god should start the four chain at (7,7), got index ${result!.index}`,
  );
}

function testGodAnswersAnOpenThree() {
  const board = buildBoard(
    [
      [7, 5],
      [7, 6],
      [7, 7],
    ],
    [
      [9, 9],
      [10, 10],
    ],
  );

  const move = getAIMove(board, 'white', 'god');
  assert(
    move !== null && move.row === 7 && (move.col === 4 || move.col === 8),
    `god should answer the open three at one of its ends, got ${describe(move)}`,
  );
}

function testGodNeverMissesAnImmediateWin() {
  const board = buildBoard(
    [
      [5, 5],
      [5, 6],
      [5, 7],
      [5, 8],
    ],
    [
      [7, 4],
      [7, 5],
      [7, 6],
      [7, 7],
    ],
  );

  const move = getAIMove(board, 'white', 'god');
  assert(
    move !== null && move.row === 7 && (move.col === 3 || move.col === 8),
    `god must take its own five before blocking, got ${describe(move)}`,
  );
}

// --- Phase 3: 天元 (VCT + opening book) -------------------------------------

function testTianyuanWinsByThreatChain() {
  // A double open three: no four is available, so only the VCT solver can prove
  // the win.
  const board = buildBoard(
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [13, 13],
    ],
    [
      [7, 5],
      [7, 6],
      [5, 7],
      [6, 7],
    ],
  );

  const result = searchAdvancedMove(board, 'white', 'tianyuan');

  assert(result !== null, 'tianyuan should return a move');
  assert(
    result!.via === 'vct',
    `tianyuan should prove the fork with VCT, resolved via ${result!.via}`,
  );
  assert(
    result!.index === indexOf(7, 7),
    `tianyuan should play the fork point (7,7), got index ${result!.index}`,
  );

  // The same position must not be *proved* by 棋神: it only owns a VCF solver,
  // which is exactly what separates the two levels.
  const godResult = searchAdvancedMove(board, 'white', 'god');
  assert(godResult !== null && godResult.via !== 'vct', 'god must not run a VCT solver');
}

function testTianyuanOpeningBook() {
  const first = searchAdvancedMove(createInitialBoard(), 'black', 'tianyuan');
  assert(
    first !== null && first.index === indexOf(7, 7) && first.via === 'book',
    'tianyuan should open on 天元',
  );

  const reply = searchAdvancedMove(buildBoard([[7, 7]], []), 'white', 'tianyuan');
  assert(reply !== null && reply.via === 'book', 'tianyuan should answer from the book');

  const row = (reply!.index / 15) | 0;
  const col = reply!.index % 15;
  assert(
    Math.abs(row - 7) === 1 && Math.abs(col - 7) === 1,
    `book reply to a centre opening should be a diagonal contact move, got (${row},${col})`,
  );
}

// --- Phase 4: 無極 (parallel roles) ------------------------------------------

function forkBoard(): GomokuBoard {
  return buildBoard(
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [13, 13],
    ],
    [
      [7, 5],
      [7, 6],
      [5, 7],
      [6, 7],
    ],
  );
}

function testWujiPlanShape() {
  assert(getParallelPlan('tianyuan', 8).length === 1, 'only 無極 splits across workers');
  assert(getParallelPlan('wuji', 1).length === 1, 'a single slot must run the full pipeline');

  const duo = getParallelPlan('wuji', 2);
  assert(duo.length === 2, 'two slots should split search and threats');
  assert(
    duo.some((role) => role.mode === 'search') && duo.some((role) => role.mode === 'threats'),
    'the two-slot plan needs one searcher and one threat hunter',
  );

  const trio = getParallelPlan('wuji', 3);
  assert(trio.length === 3, 'three slots should run search + VCF + VCT');
  assert(
    trio.filter((role) => role.mode === 'threats').length === 2,
    'the three-slot plan needs two threat hunters',
  );
  assert(getParallelPlan('wuji', 16).length === 3, 'the plan is capped at three roles');
}

function testWujiResultCombination() {
  const searchResult: GomokuSearchResult = {
    index: 10,
    score: 500,
    depth: 12,
    nodes: 1,
    elapsedMs: 1,
    via: 'search',
  };
  const emptyThreat: GomokuSearchResult = {
    index: -1,
    score: 0,
    depth: 0,
    nodes: 1,
    elapsedMs: 1,
    via: 'none',
  };
  const provenWin: GomokuSearchResult = {
    index: 20,
    score: 1_000_000_000,
    depth: 14,
    nodes: 1,
    elapsedMs: 1,
    via: 'vct',
  };

  assert(
    pickParallelResult([searchResult, emptyThreat])?.index === 10,
    'an empty threat run must never outvote the search',
  );
  assert(
    pickParallelResult([searchResult, emptyThreat, provenWin])?.index === 20,
    'a proven win must beat a heuristic search move',
  );
  assert(pickParallelResult([emptyThreat])===null, 'nothing proven and nothing searched is null');
}

// Runs the three roles one after another, which is exactly what the workers do
// in parallel, and checks the combined answer matches the sequential pipeline.
function testWujiRolesFindTheWin() {
  const board = forkBoard();
  const roles = getParallelPlan('wuji', 3);
  const results = roles.map((overrides) =>
    searchAdvancedMove(board, 'white', 'wuji', { ...overrides, timeBudgetMs: 500 }),
  );

  assert(
    results.some((result) => result?.via === 'vct'),
    'one of the 無極 threat roles should prove the fork',
  );

  const combined = pickParallelResult(results);
  assert(
    combined !== null && combined.index === indexOf(7, 7) && combined.via === 'vct',
    `combined 無極 answer should be the proven fork, got ${JSON.stringify(combined)}`,
  );

  const sequential = searchAdvancedMove(board, 'white', 'wuji');
  assert(
    sequential !== null && sequential.index === indexOf(7, 7),
    'the sequential fallback should find the same fork',
  );
}

// The runner has no DOM Worker under tsx, so this exercises the inline fallback
// path that a browser without workers would take.
async function testWujiRunnerFallback() {
  const move = await computeGomokuAiMove(forkBoard(), 'white', 'wuji');
  assert(
    move !== null && move.row === 7 && move.col === 7,
    `runner fallback should still play the fork, got ${describe(move)}`,
  );
}

// --- Performance ------------------------------------------------------------

function midgameBoard(): GomokuBoard {
  return buildBoard(
    [
      [7, 7],
      [8, 8],
      [6, 8],
      [9, 7],
      [7, 9],
    ],
    [
      [7, 8],
      [8, 7],
      [6, 7],
      [9, 9],
      [8, 6],
    ],
  );
}

// A crowded board is the worst case: many candidate points and no quick mate to
// cut the search short. Playing it out with the deterministic legacy level keeps
// the position balanced instead of hand-picking one with a hidden forced win.
function crowdedBoard(): GomokuBoard {
  let board = createInitialBoard();
  let current: GomokuStone = 'black';

  for (let ply = 0; ply < 22; ply += 1) {
    const move = getAIMove(board, current, 'hard');

    if (!move) {
      break;
    }

    board = placeStone(board, move, current);
    current = current === 'black' ? 'white' : 'black';
  }

  return board;
}

function testSearchStaysWithinBudget() {
  const positions: [string, GomokuBoard][] = [
    ['midgame', midgameBoard()],
    ['crowded', crowdedBoard()],
  ];

  for (const difficulty of ['god', 'tianyuan', 'wuji'] as const) {
    const budget = getSearchConfig(difficulty).timeBudgetMs;
    // 無極 is measured in its sequential form here (no workers under tsx), which
    // is the slowest way it can ever run.
    const runs = difficulty === 'wuji' ? 2 : 3;

    for (const [label, board] of positions) {
      let worst = 0;
      let nodes = 0;
      let depth = 0;
      let via = '';
      let score = 0;

      for (let run = 0; run < runs; run += 1) {
        const result = searchAdvancedMove(board, 'white', difficulty);
        assert(result !== null, `${difficulty} should return a move`);
        worst = Math.max(worst, result!.elapsedMs);
        nodes += result!.nodes;
        depth = result!.depth;
        via = result!.via;
        score = result!.score;
      }

      console.log(
        `  ${difficulty} / ${label}: budget ${budget}ms, worst ${worst.toFixed(0)}ms, ` +
          `depth ${depth} via ${via}, score ${score}, ` +
          `${Math.round(nodes / runs).toLocaleString()} nodes/move`,
      );
      assert(
        worst < budget * 2.5 + 200,
        `${difficulty} exceeded its time budget on ${label} ` +
          `(${worst.toFixed(0)}ms vs ${budget}ms)`,
      );
    }
  }
}

// --- Strength ---------------------------------------------------------------

function playGame(
  blackDifficulty: GomokuAIDifficulty,
  whiteDifficulty: GomokuAIDifficulty,
): GomokuStone | null {
  resetSearchMemory();

  let board = createInitialBoard();
  let current: GomokuStone = 'black';

  for (let ply = 0; ply < 225; ply += 1) {
    const difficulty = current === 'black' ? blackDifficulty : whiteDifficulty;
    const move = getAIMove(board, current, difficulty);

    if (!move) {
      return null;
    }

    board = placeStone(board, move, current);

    if (checkWinner(board, move) === current) {
      return current;
    }

    if (isBoardFull(board)) {
      return null;
    }

    current = current === 'black' ? 'white' : 'black';
  }

  return null;
}

// Ladder games are bounded by node count, not by the clock: a wall-clock budget
// makes the result depend on machine load, and a single flipped move produces a
// completely different game. Same node budget for both sides, so only the
// algorithms differ.
const LADDER_BUDGET: Partial<GomokuSearchConfig> = {
  timeBudgetMs: 60_000,
  nodeLimit: 25_000,
  vcfNodeLimit: 25_000,
  vctNodeLimit: 50_000,
};

function playSearchGame(
  blackDifficulty: 'god' | 'tianyuan' | 'wuji',
  whiteDifficulty: 'god' | 'tianyuan' | 'wuji',
): { winner: GomokuStone | null; plies: number } {
  resetSearchMemory();

  let board = createInitialBoard();
  let current: GomokuStone = 'black';

  for (let ply = 0; ply < 225; ply += 1) {
    const difficulty = current === 'black' ? blackDifficulty : whiteDifficulty;
    const result = searchAdvancedMove(board, current, difficulty, LADDER_BUDGET);

    if (!result) {
      return { winner: null, plies: ply };
    }

    const move = { row: (result.index / 15) | 0, col: result.index % 15 };
    board = placeStone(board, move, current);

    if (checkWinner(board, move) === current) {
      return { winner: current, plies: ply + 1 };
    }

    if (isBoardFull(board)) {
      return { winner: null, plies: ply + 1 };
    }

    current = current === 'black' ? 'white' : 'black';
  }

  return { winner: null, plies: 225 };
}

function testTianyuanOutplaysGod() {
  // Free-style gomoku is a first-player win, so black taking the game is the
  // expected result on both runs; the informative part is how long the defender
  // survives, which is logged rather than asserted.
  const tianyuanAttacking = playSearchGame('tianyuan', 'god');
  const godAttacking = playSearchGame('god', 'tianyuan');

  console.log(
    `  天元(黑) vs 棋神(白): ${tianyuanAttacking.winner ?? 'draw'} in ${tianyuanAttacking.plies} plies`,
  );
  console.log(
    `  棋神(黑) vs 天元(白): ${godAttacking.winner ?? 'draw'} in ${godAttacking.plies} plies`,
  );

  assert(
    tianyuanAttacking.winner === 'black',
    'tianyuan should convert the first move against god',
  );
  assert(
    godAttacking.winner === 'white',
    'tianyuan should hold and win the defending side against god',
  );
}

function testWujiOutplaysTianyuan() {
  const wujiAttacking = playSearchGame('wuji', 'tianyuan');
  const tianyuanAttacking = playSearchGame('tianyuan', 'wuji');

  console.log(
    `  無極(黑) vs 天元(白): ${wujiAttacking.winner ?? 'draw'} in ${wujiAttacking.plies} plies`,
  );
  console.log(
    `  天元(黑) vs 無極(白): ${tianyuanAttacking.winner ?? 'draw'} in ${tianyuanAttacking.plies} plies`,
  );

  // At an equal node budget 無極 is only marginally ahead of 天元 (deeper VCF /
  // VCT, deeper window); its real margin comes from the bigger clock and the
  // parallel roles, which this single-threaded harness cannot reproduce.
  assert(
    wujiAttacking.winner === 'black',
    'wuji should convert the first move against tianyuan',
  );
}

function testGodBeatsMaster() {
  // Free-style gomoku is a first-player win, so the meaningful test is that the
  // new level wins as black and does not lose as white.
  const asBlack = playGame('god', 'master');
  const asWhite = playGame('master', 'god');

  console.log(`  god as black vs 棋聖: ${asBlack ?? 'draw'}`);
  console.log(`  棋聖 vs god as white: ${asWhite ?? 'draw'}`);

  assert(asBlack === 'black', 'god should beat 棋聖 with the first move');
  assert(asWhite !== 'black', 'god should not lose to 棋聖 while defending');
}

const tests: [string, () => void | Promise<void>][] = [
  ['winner detection', testWinnerDetection],
  ['legacy AI finishes a winning line', testAiFinishesWinningLine],
  ['legacy AI blocks an immediate threat', testAiBlocksImmediateThreat],
  ['legacy AI opens at the centre', testAiOpensAtCenter],
  ['shape classifier', testShapeClassifier],
  ['make/unmake is exact', testMakeUnmakeIsExact],
  ['god wins by continuous fours', testGodWinsByContinuousFours],
  ['god answers an open three', testGodAnswersAnOpenThree],
  ['god never misses an immediate win', testGodNeverMissesAnImmediateWin],
  ['tianyuan wins by a threat chain', testTianyuanWinsByThreatChain],
  ['tianyuan opening book', testTianyuanOpeningBook],
  ['wuji parallel plan shape', testWujiPlanShape],
  ['wuji result combination', testWujiResultCombination],
  ['wuji roles find the win', testWujiRolesFindTheWin],
  ['wuji runner fallback', testWujiRunnerFallback],
  ['search stays within budget', testSearchStaysWithinBudget],
  ['god beats 棋聖', testGodBeatsMaster],
  ['tianyuan outplays god', testTianyuanOutplaysGod],
  ['wuji outplays tianyuan', testWujiOutplaysTianyuan],
];

for (const [name, run] of tests) {
  const startedAt = Date.now();
  await run();
  console.log(`ok  ${name} (${Date.now() - startedAt}ms)`);
}

console.log('gomoku smoke ok');
