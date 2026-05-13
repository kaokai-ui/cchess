import {
  createInitialBoard,
  flipPiece,
  movePiece,
  getValidMoves,
  getValidFlips,
  checkWinner,
  countPieces,
  countUnrevealed,
  cloneBoard,
} from './engine.js';

const ROWS = 4;
const COLS = 8;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function log(msg) {
  console.log(`  ✓ ${msg}`);
}

function testBoardCreation() {
  console.log('\n[Test 1] Board Creation');
  const board = createInitialBoard();

  assert(board.length === ROWS, 'Board has 4 rows');
  assert(board[0].length === COLS, 'Board has 8 columns');

  let totalPieces = 0;
  let unrevealedCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      assert(board[r][c] !== null, `Cell [${r}][${c}] has a piece`);
      totalPieces++;
      if (board[r][c] && !board[r][c].revealed) unrevealedCount++;
    }
  }

  assert(totalPieces === 32, `32 pieces on board (got ${totalPieces})`);
  assert(unrevealedCount === 32, 'All pieces are unrevealed initially');
  log('Board created with 32 unrevealed pieces');
}

function testFlipMechanism() {
  console.log('\n[Test 2] Flip Mechanism');
  const board = createInitialBoard();

  const validFlips = getValidFlips(board);
  assert(validFlips.length === 32, '32 valid flips available');

  const flipPos = validFlips[0];
  const newBoard = flipPiece(board, flipPos);

  assert(newBoard[flipPos.row][flipPos.col].revealed, 'Flipped piece is revealed');
  assert(countUnrevealed(newBoard) === 31, '31 unrevealed pieces remain');

  log('Flip mechanism works correctly');
}

function testNoEarlyGameOver() {
  console.log('\n[Test 3] No Early Game Over After First Flips');

  const board = createInitialBoard();
  const validFlips = getValidFlips(board);

  const flipPositions = validFlips.slice(0, 3);

  const board1 = flipPiece(board, flipPositions[0]);
  assert(checkWinner(board1) === null, 'No winner after 1 flip');

  const board2 = flipPiece(board1, flipPositions[1]);
  assert(checkWinner(board2) === null, 'No winner after 2 flips');

  const board3 = flipPiece(board2, flipPositions[2]);
  assert(checkWinner(board3) === null, 'No winner after 3 flips');

  log('No premature game over detected');
}

function createTestBoard() {
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'general', color: 'red', revealed: true };
  board[0][1] = { type: 'soldier', color: 'black', revealed: true };
  board[1][0] = { type: 'soldier', color: 'red', revealed: true };
  board[1][1] = { type: 'general', color: 'black', revealed: true };
  return board;
}

function testGameEndCondition() {
  console.log('\n[Test 4] Game End Condition');

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'chariot', color: 'red', revealed: true };
  board[0][1] = { type: 'soldier', color: 'black', revealed: true };

  assert(checkWinner(board) === null, 'Initial test board: no winner');

  board = movePiece(board, { row: 0, col: 0 }, { row: 0, col: 1 });
  const winner = checkWinner(board);
  assert(winner === 'red', `After red captures black soldier: red wins (got ${winner})`);

  log('Game end condition works correctly');
}

function testSoldierCapturesGeneral() {
  console.log('\n[Test 5] Soldier Can Capture General');

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'soldier', color: 'red', revealed: true };
  board[0][1] = { type: 'general', color: 'black', revealed: true };

  const moves = getValidMoves(board, { row: 0, col: 0 }, 'red');
  assert(moves.some(m => m.row === 0 && m.col === 1), 'Soldier can move to capture general');

  board = movePiece(board, { row: 0, col: 0 }, { row: 0, col: 1 });
  const winner = checkWinner(board);
  assert(winner === 'red', `After soldier captures general: red wins (got ${winner})`);

  log('Soldier captures general rule works correctly');
}

function testGeneralCannotCaptureSoldier() {
  console.log('\n[Test 6] General Cannot Capture Soldier');

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'general', color: 'red', revealed: true };
  board[0][1] = { type: 'soldier', color: 'black', revealed: true };

  const moves = getValidMoves(board, { row: 0, col: 0 }, 'red');
  assert(!moves.some(m => m.row === 0 && m.col === 1), 'General cannot move to capture soldier');

  log('General cannot capture soldier rule works correctly');
}

function simulateCompleteGame() {
  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'chariot', color: 'red', revealed: true };
  board[0][1] = { type: 'soldier', color: 'black', revealed: true };
  
  let currentPlayer = 'red';
  let turnCount = 0;
  let gameOver = false;
  let winner = null;

  while (!gameOver && turnCount < 10) {
    const hasMoves = (() => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = board[r][c];
          if (cell && cell.revealed && cell.color === currentPlayer) {
            if (getValidMoves(board, { row: r, col: c }, currentPlayer).length > 0) {
              return true;
            }
          }
        }
      }
      return false;
    })();

    if (hasMoves) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = board[r][c];
          if (cell && cell.revealed && cell.color === currentPlayer) {
            const moves = getValidMoves(board, { row: r, col: c }, currentPlayer);
            const captureMoves = moves.filter(to => {
              const target = board[to.row][to.col];
              return target && target.revealed && target.color !== currentPlayer;
            });
            
            const target = captureMoves.length > 0 ? captureMoves[0] : moves[0];
            board = movePiece(board, { row: r, col: c }, target);
          }
        }
      }
    }

    winner = checkWinner(board);
    if (winner !== null) {
      gameOver = true;
    }

    currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
    turnCount++;
  }

  return { gameOver, winner, turnCount };
}

function testTwoCompleteGames() {
  console.log('\n[Test 5] Two Complete Games');

  for (let gameNum = 1; gameNum <= 2; gameNum++) {
    console.log(`\n  --- Game ${gameNum} ---`);

    const result = simulateCompleteGame();

    if (result.gameOver) {
      log(`Game ${gameNum}: ${result.winner} wins after ${result.turnCount} turns`);
    } else {
      log(`Game ${gameNum}: Ended after ${result.turnCount} turns (draw or max turns reached)`);
    }

    assert(result.gameOver, `Game ${gameNum} should have a winner`);
    assert(result.turnCount > 0, `Game ${gameNum} had at least one turn`);
  }

  log('Two complete games simulated successfully');
}

function testGameStateTransitions() {
  console.log('\n[Test 6] Game State Transitions');

  let board = createInitialBoard();
  const validFlips = getValidFlips(board);
  
  assert(checkWinner(board) === null, 'Initial state: no winner');
  
  board = flipPiece(board, validFlips[0]);
  assert(checkWinner(board) === null, 'After 1 flip: no winner');
  
  board = flipPiece(board, validFlips[1]);
  assert(checkWinner(board) === null, 'After 2 flips: no winner');

  log('Game state transitions work correctly');
}

function testSoldierCapturesSoldier() {
  console.log('\n[Test 7] Soldier Can Capture Soldier');

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'soldier', color: 'red', revealed: true };
  board[0][1] = { type: 'soldier', color: 'black', revealed: true };

  const moves = getValidMoves(board, { row: 0, col: 0 }, 'red');
  assert(moves.some(m => m.row === 0 && m.col === 1), 'Soldier can move to capture soldier');

  board = movePiece(board, { row: 0, col: 0 }, { row: 0, col: 1 });
  const redCount = countPieces(board, 'red');
  const blackCount = countPieces(board, 'black');
  assert(redCount === 1 && blackCount === 0, 'Red soldier captured black soldier');

  log('Soldier captures soldier rule works correctly');
}

function testCannonCapture() {
  console.log('\n[Test 8] Cannon Capture Rule');

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'cannon', color: 'red', revealed: true };
  board[0][1] = { type: 'soldier', color: 'red', revealed: true }; // Mount
  board[0][2] = { type: 'general', color: 'black', revealed: true }; // Target

  const moves = getValidMoves(board, { row: 0, col: 0 }, 'red');
  assert(moves.some(m => m.row === 0 && m.col === 2), 'Cannon can jump over mount to capture General');
  
  board = movePiece(board, { row: 0, col: 0 }, { row: 0, col: 2 });
  assert(checkWinner(board) === 'red', 'Cannon captured General and won');

  log('Cannon capture rule works correctly');
}

function testSoldierCannotCaptureDiagonalGeneral() {
  console.log('\n[Test 9] Soldier Cannot Capture Diagonal General');
  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  board[0][0] = { type: 'soldier', color: 'red', revealed: true };
  board[1][1] = { type: 'general', color: 'black', revealed: true }; // Diagonal

  const moves = getValidMoves(board, { row: 0, col: 0 }, 'red');
  assert(!moves.some(m => m.row === 1 && m.col === 1), 'Soldier cannot move diagonally to capture General');
  log('Soldier cannot capture diagonal General');
}

console.log('=== Dark Chess Engine Tests ===');

try {
  testBoardCreation();
  testFlipMechanism();
  testNoEarlyGameOver();
  testGameEndCondition();
  testSoldierCapturesGeneral();
  testGeneralCannotCaptureSoldier();
  testSoldierCapturesSoldier();
  testCannonCapture();
  testSoldierCannotCaptureDiagonalGeneral();
  testTwoCompleteGames();
  testGameStateTransitions();

  console.log('\n✅ All tests passed!');
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Test failed: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
