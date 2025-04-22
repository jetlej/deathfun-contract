Death Race is a high-stakes web-based gambling game where players navigate through a grid of tiles, making strategic choices to maximize their potential winnings while risking their initial bet. The game combines elements of risk management, probability, and quick decision-making in a visually engaging format.

### Core Game Mechanics

- Players start with an initial wallet amount (default: 1000) and place a bet
- Game board consists of rows of different numbers of tiles
- Each row contains one 'death tile' that ends the game and causes bet loss
- Each row has a base multiplier that increases as you progress upward
- Players must select one tile per row to progress upward
- Base multiplier for each row is calculated as: 1 / (1 - death_probability)
  - With 5 tiles per row and 1 death tile, base multiplier is 1 / (1 - 0.2) = 1.25x
  - This represents the fair multiplier based on probability
- Cumulative multiplier for each row is the product of all previous row multipliers
  - Row 1: 1.25x
  - Row 2: 1.25 × 1.25 = 1.5625x
  - Row 3: 1.5625 × 1.25 = 1.953125x
  - And so on...
- Current potential winnings are calculated as: initial_bet × current_cumulative_multiplier
- There is a 2.5% house edge / fee applied to the multiplier before payout, so the final calc is actually multiplier \* .975
- Players can "cash out" at any time to secure their current winnings
- If a death tile is hit before cashing out, player loses their entire initial bet

## Probably Fair System (see provably-fair.js)

This game is designed such that all randomness is determined before the game begins, and stored on chain as a SHA256 hash. After the game is over, the fields in the hash are added to the game struct in the smart contract so they can verify the hash is valid, and the death tiles were not changed.

1. Players select the number of tiles they want in each row (shorter rows = higher risk & higher reward)
2. Upon placing a bet, a seed is randomly generated that determines death tile index
3. We create a hash of the seed, rows & the algoVersion (the version of the seed -> death tile locations algo, in case we change this in the future), and include that hash in the game creation event on-chain, as well as the algoVersion and rows 
4. After the game ends, either by the user cashing out of hitting a death tile, we update the smart contract with the gameSeed
5. While all of this will be available on-chain, we will also provide an open-source front-end that allows users to easily verify the hash & game details
