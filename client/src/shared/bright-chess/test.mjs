import {
  createInitialBoard,
  getValidMoves,
  movePiece,
  checkWinner,
  checkStalemate,
  hasAnyValidMove,
} from './engine.js';
import { getAIMove } from './ai.js';

const ROWS = 10;
const COLS = 9;

function log(msg) {
  console.log(`  ${msg}`);
}

function findGeneralPos(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.type === 'general' && p.color === color) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function simulateBrightChessGame(maxTurns = 200) {
  let board = createInitialBoard();
  let currentPlayer = 'red';
  let turnCount = 0;
  let gameOver = false;
  let winner = null;
  let aiMoveCount = { red: 0, black: 0 };
  let totalTime = 0;
  let lastCaptureTurn = 0;

  log('Starting Bright Chess simulation (Master vs Master)');
  log(`Initial board: Red general at ${JSON.stringify(findGeneralPos(board, 'red'))}, Black general at ${JSON.stringify(findGeneralPos(board, 'black'))}`);

  while (!gameOver && turnCount < maxTurns) {
    const turnStart = Date.now();
    
    // Check for game end
    winner = checkWinner(board);
    if (winner) {
      gameOver = true;
      log(`Game over: ${winner} wins (general captured)`);
      break;
    }

    const stalemate = checkStalemate(board, currentPlayer);
    if (stalemate) {
      gameOver = true;
      winner = currentPlayer === 'red' ? 'black' : 'red';
      log(`Game over: ${winner} wins (stalemate)`);
      break;
    }

    // Draw detection: no captures in 60 turns
    if (turnCount - lastCaptureTurn > 60 && turnCount > 30) {
      gameOver = true;
      log(`Game over: Draw (no captures in 60 turns)`);
      break;
    }

    // Get AI move
    const aiMove = getAIMove(board, currentPlayer, 'master');
    const turnTime = Date.now() - turnStart;
    totalTime += turnTime;

    if (!aiMove) {
      log(`Turn ${turnCount + 1}: ${currentPlayer} has no valid moves`);
      gameOver = true;
      winner = currentPlayer === 'red' ? 'black' : 'red';
      break;
    }

    aiMoveCount[currentPlayer]++;
    
    // Apply move
    const captured = board[aiMove.to.row][aiMove.to.col];
    board = movePiece(board, aiMove.from, aiMove.to);
    
    if (captured) {
      lastCaptureTurn = turnCount;
    }
    
    const captureInfo = captured ? ` (captured ${captured.color} ${captured.type})` : '';
    
    if (turnCount < 5 || turnCount >= maxTurns - 5 || captured) {
      log(`Turn ${turnCount + 1}: ${currentPlayer} ${aiMove.from.row},${aiMove.from.col} -> ${aiMove.to.row},${aiMove.to.col}${captureInfo} [${(turnTime / 1000).toFixed(1)}s]`);
    } else if (turnCount === 5) {
      log(`  ... (showing captures only) ...`);
    }

    currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
    turnCount++;
  }

  return {
    gameOver,
    winner,
    turnCount,
    aiMoveCount,
    totalTime,
    avgTime: totalTime / Math.max(turnCount, 1),
  };
}

console.log('\n=== Bright Chess Master vs Master Test ===\n');

try {
  const result = simulateBrightChessGame(200);

  console.log('\n--- Results ---');
  console.log(`Game completed: ${result.gameOver}`);
  console.log(`Winner: ${result.winner || 'none'}`);
  console.log(`Total turns: ${result.turnCount}`);
  console.log(`Red AI moves: ${result.aiMoveCount.red}`);
  console.log(`Black AI moves: ${result.aiMoveCount.black}`);
  console.log(`Total time: ${(result.totalTime / 1000).toFixed(1)}s`);
  console.log(`Avg time per move: ${(result.avgTime / 1000).toFixed(1)}s`);

  if (result.gameOver) {
    console.log('\n✅ Game completed successfully!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Game did not complete within turn limit');
    process.exit(1);
  }
} catch (error) {
  console.error(`\n❌ Test failed: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
