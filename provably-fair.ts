import crypto from 'crypto';

// Length of the random seed
const SEED_LENGTH = 32;

/**
 * Generates a random seed for game verification
 * @returns A random string to use as a game seed
 */
export function generateGameSeed(): string {
  return crypto.randomBytes(SEED_LENGTH).toString('hex');
}

/**
 * Creates a commitment hash from the game state, version, and a random seed
 * @param algoVersion The version of the algorithm
 * @param rows The complete game rows (array of tile counts)
 * @param seed The random seed for this game
 * @returns SHA-256 hash of the version, rows, and seed
 */
export function createCommitmentHash(algoVersion: string, rows: number[], seed: string): string {
  const gameData = JSON.stringify({
    algoVersion,
    rows,
    seed,
  });
  return crypto.createHash('sha256').update(gameData).digest('hex');
}

/**
 * Deterministically generates a death tile index for a row based on the game seed
 * @param seed The game seed
 * @param rowIndex The index of the row
 * @param totalTiles The number of tiles in the row
 * @returns A deterministic index for the death tile
 */
export function getDeathTileIndex(seed: string, rowIndex: number, totalTiles: number): number {
  // Create a unique string for this specific row
  const hashSource = `${seed}-row${rowIndex}`;

  // Use SHA-256 for better randomness
  const hash = crypto.createHash('sha256').update(hashSource).digest('hex');

  // Convert the first 8 characters of the hash to a number
  // This gives us a large number to work with
  const numericHash = parseInt(hash.slice(0, 8), 16);

  // Use modulo to get a number between 0 and totalTiles-1
  return numericHash % totalTiles;
}
