import { getAIMove } from '../src/shared/gomoku/ai';
import { checkWinner, createInitialBoard, placeStone } from '../src/shared/gomoku/engine';
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
  let board = createInitialBoard();
  board = placeMany(board, 'white', [
    { row: 7, col: 5 },
    { row: 7, col: 6 },
    { row: 7, col: 7 },
    { row: 7, col: 8 },
  ]);
  board = placeMany(board, 'black', [
    { row: 8, col: 5 },
    { row: 8, col: 6 },
  ]);

  const move = getAIMove(board, 'white', 'hard');
  assert(
    move !== null && move.row === 7 && (move.col === 4 || move.col === 9),
    `AI should finish its open four, got ${JSON.stringify(move)}`,
  );
}

function testAiBlocksImmediateThreat() {
  let board = createInitialBoard();
  board = placeMany(board, 'black', [
    { row: 5, col: 5 },
    { row: 5, col: 6 },
    { row: 5, col: 7 },
    { row: 5, col: 8 },
  ]);
  board = placeMany(board, 'white', [
    { row: 7, col: 7 },
    { row: 8, col: 8 },
  ]);

  const move = getAIMove(board, 'white', 'master');
  assert(
    move !== null && move.row === 5 && (move.col === 4 || move.col === 9),
    `AI should block immediate loss, got ${JSON.stringify(move)}`,
  );
}

function testAiOpensAtCenter() {
  const move = getAIMove(createInitialBoard(), 'white', 'normal');
  assert(
    move !== null && move.row === 7 && move.col === 7,
    `Opening move should prefer center, got ${JSON.stringify(move)}`,
  );
}

testWinnerDetection();
testAiFinishesWinningLine();
testAiBlocksImmediateThreat();
testAiOpensAtCenter();

console.log('gomoku smoke ok');
