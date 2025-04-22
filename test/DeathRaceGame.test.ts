import * as hre from 'hardhat';
import { expect } from 'chai';
import { Deployer } from '@matterlabs/hardhat-zksync';
import { Wallet, Provider, Contract } from 'zksync-ethers';
import { vars } from 'hardhat/config';
import { ethers } from 'ethers';
import { LOCAL_RICH_WALLETS } from '../deploy/utils';

describe('DeathRaceGame', function () {
  // Increase timeout for zkSync tests
  this.timeout(60000);

  let deathRaceGame: Contract;
  let deployer: Wallet;
  let player: Wallet;
  let provider: Provider;
  let serverSigner: Wallet; // Added for clarity, will use deployer

  const betAmount = ethers.parseEther('0.01');
  const minBetAmount = ethers.parseEther('0.001');
  const preliminaryGameId = 'test-game-123';
  const commitmentHash = '0x123456789abcdef'; // Placeholder, will be set by backend listener
  const selectedTiles = [1, 2, 3];
  const gameSeedHash = ethers.keccak256(ethers.toUtf8Bytes('test-seed-value')); // Example seed hash
  const gameSeed = ethers.keccak256(ethers.toUtf8Bytes('actual-test-seed-value')); // Example revealed seed - passed to backend, not contract

  const algoVersion = 'v1';
  const rows = [5, 5, 5, 5, 5]; // Example row config for tests

  // Helper to sign createGame parameters with domain separator and abi.encode
  const signCreateGameParams = async (
    preliminaryGameId: string,
    gameSeedHash: string,
    algoVersion: string,
    rows: number[],
    player: string,
    betAmount: bigint
  ) => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(
      ['string', 'string', 'bytes32', 'string', 'uint8[]', 'address', 'uint256'],
      [
        'DeathRaceGame:createGame',
        preliminaryGameId,
        gameSeedHash,
        algoVersion,
        rows,
        player,
        betAmount,
      ]
    );
    const hash = ethers.keccak256(encoded);
    const signature = await serverSigner.signMessage(ethers.getBytes(hash));
    return signature;
  };

  before(async () => {
    provider = new Provider(hre.network.config.url);
    const deployerWallet = LOCAL_RICH_WALLETS[0];
    const playerWallet = LOCAL_RICH_WALLETS[1];
    deployer = new Wallet(deployerWallet.privateKey, provider);
    player = new Wallet(playerWallet.privateKey, provider);
    serverSigner = deployer; // Use deployer as the server signer for tests

    console.log(`Using rich wallets for testing: 
      Deployer/ServerSigner: ${deployerWallet.address}
      Player: ${playerWallet.address}`);
  });

  beforeEach(async function () {
    // Deploy the contract before each test
    const hardhatDeployer = new Deployer(hre, deployer);
    const artifact = await hardhatDeployer.loadArtifact('DeathRaceGame');
    // The constructor now sets the owner and serverSignerAddress to deployer
    deathRaceGame = await hardhatDeployer.deploy(artifact);
    await deathRaceGame.waitForDeployment();
    // Explicitly set server signer address (optional as constructor does it, but good practice)
    // const setSignerTx = await (deathRaceGame as any).connect(deployer).setServerSignerAddress(await serverSigner.getAddress());
    // await setSignerTx.wait();

    console.log(
      `DeathRaceGame deployed at: ${await deathRaceGame.getAddress()}, Server Signer: ${await (
        deathRaceGame as any
      ).serverSignerAddress()}`
    );
  });

  describe('Game Creation', function () {
    it('Should allow a player to create a new game with a valid server signature', async function () {
      const contractAsAny = deathRaceGame as any;
      const serverSignature = await signCreateGameParams(
        preliminaryGameId,
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );

      const tx = await contractAsAny
        .connect(player)
        .createGame(preliminaryGameId, gameSeedHash, algoVersion, rows, serverSignature, {
          value: betAmount,
        });
      await tx.wait();
      const onChainGameId = await contractAsAny.getOnChainGameId(preliminaryGameId);

      expect(Number(onChainGameId)).to.not.equal(0);
      const gameDetails = await contractAsAny.getGameDetails(onChainGameId);
      expect(gameDetails.player).to.equal(await player.getAddress());
      expect(gameDetails.betAmount.toString()).to.equal(betAmount.toString());
      expect(gameDetails.gameSeedHash).to.equal(gameSeedHash);
      expect(gameDetails.algoVersion).to.equal(algoVersion);
      expect(gameDetails.rows.map((n: any) => Number(n))).to.deep.equal(rows);
    });

    it('Should fail to create a game with an invalid server signature', async function () {
      const contractAsAny = deathRaceGame as any;
      const invalidSignature = await player.signMessage(
        ethers.getBytes(
          ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['string', 'string', 'bytes32', 'string', 'uint8[]', 'address', 'uint256'],
              [
                'DeathRaceGame:createGame',
                preliminaryGameId,
                gameSeedHash,
                algoVersion,
                rows,
                await player.getAddress(),
                betAmount,
              ]
            )
          )
        )
      );

      try {
        await contractAsAny
          .connect(player)
          .createGame(preliminaryGameId, gameSeedHash, algoVersion, rows, invalidSignature, {
            value: betAmount,
          });
        expect.fail('Transaction should have failed with InvalidServerSignature');
      } catch (error: any) {
        // We expect a revert, check for the specific error if possible,
        // but Hardhat/ethers might wrap it. Check for revert existence.
        expect(error.message).to.include('reverted');
        // Ideally check: expect(error.message).to.include('InvalidServerSignature');
        // but custom errors might not propagate well through the stack yet.
      }
    });

    // Other createGame failure tests (e.g., existing ID) should also include valid signatures now
    it('Should fail to create a game with an existing preliminary ID', async function () {
      const contractAsAny = deathRaceGame as any;
      const serverSignature1 = await signCreateGameParams(
        preliminaryGameId,
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );
      const tx = await contractAsAny
        .connect(player)
        .createGame(preliminaryGameId, gameSeedHash, algoVersion, rows, serverSignature1, {
          value: betAmount,
        });
      await tx.wait();

      const serverSignature2 = await signCreateGameParams(
        preliminaryGameId,
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );
      try {
        await contractAsAny
          .connect(player)
          .createGame(preliminaryGameId, gameSeedHash, algoVersion, rows, serverSignature2, {
            value: betAmount,
          });
        expect.fail('Transaction should have failed with GameAlreadyExists');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
        // Ideally: expect(error.message).to.include('GameAlreadyExists');
      }
    });
  });

  describe('Game Cash Out', function () {
    let onChainGameId: ethers.BigNumberish;
    let contractAsAny: any;

    beforeEach(async function () {
      contractAsAny = deathRaceGame as any;
      // Fund the contract (needed for payouts)
      const fundingAmount = ethers.parseEther('0.05');
      const fundingGameId = 'funding-game-' + Date.now();
      const fundingGameSeedHash = ethers.ZeroHash;
      const fundingSignature = await signCreateGameParams(
        fundingGameId,
        fundingGameSeedHash,
        algoVersion,
        rows,
        await deployer.getAddress(),
        fundingAmount
      );
      const fundTx = await contractAsAny
        .connect(deployer)
        .createGame(fundingGameId, fundingGameSeedHash, algoVersion, rows, fundingSignature, {
          value: fundingAmount,
        });
      await fundTx.wait();

      // Create the actual game for the test using the player wallet
      const serverSignature = await signCreateGameParams(
        preliminaryGameId,
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );
      const createTx = await contractAsAny
        .connect(player)
        .createGame(preliminaryGameId, gameSeedHash, algoVersion, rows, serverSignature, {
          value: betAmount,
        });
      await createTx.wait();
      onChainGameId = await contractAsAny.getOnChainGameId(preliminaryGameId);
    });

    it('Should allow the server signer to cash out a game', async function () {
      const payoutAmount = betAmount * BigInt(2);
      const playerBalanceBefore = await provider.getBalance(await player.getAddress());
      const serverBalanceBefore = await provider.getBalance(await serverSigner.getAddress());

      // No signature needed from server
      // const serverSignature = await signParams(
      //   ['uint256', 'uint256', 'string'],
      //   [onChainGameId, payoutAmount, selectedTilesHash]
      // );

      const tx = await contractAsAny
        .connect(serverSigner) // Server initiates the cash out
        .cashOut(onChainGameId, payoutAmount, selectedTiles, gameSeed); // Add gameSeed

      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed ?? BigInt(0);
      const gasPrice = receipt?.gasPrice ?? BigInt(0);
      const serverGasCost = BigInt(gasUsed) * BigInt(gasPrice);

      const playerBalanceAfter = await provider.getBalance(await player.getAddress());
      const serverBalanceAfter = await provider.getBalance(await serverSigner.getAddress());

      // Player's balance should increase by payoutAmount
      expect(playerBalanceAfter).to.equal(playerBalanceBefore + payoutAmount);

      // Server's balance should decrease by approximately gasCost
      const expectedServerBalance = serverBalanceBefore - serverGasCost;
      const serverBalanceAfterNum = Number(ethers.formatEther(serverBalanceAfter));
      const expectedServerBalanceNum = Number(ethers.formatEther(expectedServerBalance));
      const tolerance = 0.001; // Tolerance for gas calculation variations
      expect(serverBalanceAfterNum).to.be.closeTo(
        expectedServerBalanceNum,
        tolerance,
        'Server signer balance incorrect after paying gas for cash out'
      );

      const gameDetails = await contractAsAny.getGameDetails(onChainGameId);
      expect(Number(gameDetails.status)).to.equal(1); // Won
      expect(gameDetails.payoutAmount.toString()).to.equal(payoutAmount.toString());
      expect(gameDetails.selectedTiles.map((n: any) => Number(n))).to.deep.equal(selectedTiles);
    });

    it('Should fail if the player tries to cash out directly', async function () {
      const payoutAmount = betAmount * BigInt(2);
      // No server signature involved
      try {
        await contractAsAny
          .connect(player) // Player attempts cash out
          .cashOut(onChainGameId, payoutAmount, selectedTiles, gameSeed);
        expect.fail('Transaction should have failed with Only server can cash out');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
        // Ideally check for the specific custom error message:
        // expect(error.message).to.include('Only server can cash out');
      }
    });

    // Test checking 'NotGamePlayer' is removed/obsolete as server (non-player) is the caller now.

    it('Should fail if server tries cashing out an already paid game', async function () {
      const payoutAmount = betAmount * BigInt(2);
      // First cashout (by server)
      await contractAsAny
        .connect(serverSigner)
        .cashOut(onChainGameId, payoutAmount, selectedTiles, gameSeed);
      // await tx.wait(); // Wait not needed if just checking revert

      // Attempt second cashout (by server)
      try {
        await contractAsAny
          .connect(serverSigner)
          .cashOut(onChainGameId, payoutAmount, selectedTiles, gameSeed);
        expect.fail('Transaction should have failed with GameNotActive');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
        // Check specific error
        // expect(error.message).to.include('GameNotActive');
      }
    });
  });

  describe('Mark Game as Lost', function () {
    let onChainGameId: ethers.BigNumberish;
    let contractAsAny: any;
    const actualGameSeed = ethers.id('some-random-seed-for-loss'); // Example seed as bytes32

    beforeEach(async function () {
      contractAsAny = deathRaceGame as any;
      // Create game first
      const serverSignature = await signCreateGameParams(
        preliminaryGameId,
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );
      const createTx = await contractAsAny
        .connect(player)
        .createGame(preliminaryGameId, gameSeedHash, algoVersion, rows, serverSignature, {
          value: betAmount,
        });
      await createTx.wait();
      onChainGameId = await contractAsAny.getOnChainGameId(preliminaryGameId);
    });

    it('Should allow the server signer to mark a game as lost', async function () {
      // No signature needed
      // const serverSignature = await signParams(...);
      await contractAsAny
        .connect(serverSigner) // Called by server
        .markGameAsLost(onChainGameId, selectedTiles, actualGameSeed); // No signature, add seed

      const gameDetails = await contractAsAny.getGameDetails(onChainGameId);
      expect(Number(gameDetails.status)).to.equal(2); // Lost
      expect(gameDetails.selectedTiles.map((n: any) => Number(n))).to.deep.equal(selectedTiles);
      expect(gameDetails.gameSeed).to.equal(actualGameSeed); // Check seed
      expect(gameDetails.algoVersion).to.equal(algoVersion);
      expect(gameDetails.rows.map((n: any) => Number(n))).to.deep.equal(rows);
    });

    it('Should fail if the player tries to mark the game as lost directly', async function () {
      // No signature needed
      try {
        await contractAsAny
          .connect(player) // Player attempts
          .markGameAsLost(onChainGameId, selectedTiles, actualGameSeed);
        expect.fail('Transaction should have failed with Only server can mark game lost');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
        // Ideally check specific error:
        // expect(error.message).to.include('Only server can mark game lost');
      }
    });

    // Test checking 'NotGamePlayer' is removed/obsolete.

    it('Should fail if server tries marking a non-active game as lost', async function () {
      // Mark as lost first (by server)
      await contractAsAny
        .connect(serverSigner)
        .markGameAsLost(onChainGameId, selectedTiles, actualGameSeed);
      // await tx.wait();

      // Attempt to mark as lost again (by server)
      try {
        await contractAsAny
          .connect(serverSigner)
          .markGameAsLost(onChainGameId, selectedTiles, actualGameSeed);
        expect.fail('Transaction should have failed with GameNotActive');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
        // Check specific error
        // expect(error.message).to.include('GameNotActive');
      }
    });
  });

  describe('Admin Functions', function () {
    // Admin functions (updateHouseFee, withdrawFunds, setServerSignerAddress)
    // are protected by Ownable and don't need server signatures themselves.
    // Tests for these can remain largely unchanged, but we add a test for setServerSignerAddress.
    let contractAsAny: any;

    beforeEach(function () {
      contractAsAny = deathRaceGame as any;
    });

    it('Should allow the owner to update the server signer address', async function () {
      const newSigner = player; // Use player wallet as the new signer for test
      await contractAsAny.connect(deployer).setServerSignerAddress(await newSigner.getAddress());
      const updatedSigner = await contractAsAny.serverSignerAddress();
      expect(updatedSigner).to.equal(await newSigner.getAddress());
    });

    it('Should fail if non-owner tries to update the server signer address', async function () {
      const newSigner = player;
      try {
        await contractAsAny.connect(player).setServerSignerAddress(await newSigner.getAddress());
        expect.fail('Transaction should have failed with OwnableUnauthorizedAccount');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
        // Ideally: expect(error.message).to.include('OwnableUnauthorizedAccount');
      }
    });

    // Keep existing admin tests (updateHouseFee, withdrawFunds)
    it('Should allow the owner to withdraw funds', async function () {
      // Need to fund the contract first using createGame with a valid server sig
      const serverSignature = await signCreateGameParams(
        'funding-game-1',
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );
      const tx = await contractAsAny
        .connect(player) // Player creates the game
        .createGame('funding-game-1', gameSeedHash, algoVersion, rows, serverSignature, {
          value: betAmount,
        });
      await tx.wait();

      const ownerBalanceBefore = await provider.getBalance(await deployer.getAddress());
      const recipientAddress = await player.getAddress();
      const recipientBalanceBefore = await provider.getBalance(recipientAddress);
      const contractBalanceBefore = await provider.getBalance(await deathRaceGame.getAddress());

      expect(Number(contractBalanceBefore)).to.be.greaterThan(0);

      const withdrawTx = await contractAsAny
        .connect(deployer)
        .withdrawFunds(betAmount, recipientAddress);
      const receipt = await withdrawTx.wait();
      const gasUsed = receipt?.gasUsed ?? BigInt(0);
      const gasPrice = receipt?.gasPrice ?? BigInt(0);
      const gasCost = BigInt(gasUsed) * BigInt(gasPrice);

      const ownerBalanceAfter = await provider.getBalance(await deployer.getAddress());
      const recipientBalanceAfter = await provider.getBalance(recipientAddress);
      const contractBalanceAfter = await provider.getBalance(await deathRaceGame.getAddress());

      // Contract balance might not be exactly 0 if funding game is still there
      // Check that the owner received the withdrawn amount (approximately)
      expect(Number(ethers.formatEther(contractBalanceAfter))).to.be.lessThan(
        Number(ethers.formatEther(contractBalanceBefore))
      );

      // Check recipient balance increased
      expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + betAmount);

      // Check owner balance decreased only by gas
      const expectedOwnerBalance = ownerBalanceBefore - gasCost;
      const ownerBalanceAfterNum = Number(ethers.formatEther(ownerBalanceAfter));
      const expectedOwnerBalanceNum = Number(ethers.formatEther(expectedOwnerBalance));
      const tolerance = 0.001; // Tolerance for gas calculation variations
      expect(ownerBalanceAfterNum).to.be.closeTo(
        expectedOwnerBalanceNum,
        tolerance,
        'Owner balance incorrect after paying gas for withdrawal'
      );
    });

    // ... other existing admin failure tests remain the same ...
    it('Should fail when a non-owner tries to withdraw funds', async function () {
      // Fund first
      const serverSignature = await signCreateGameParams(
        'funding-game-2',
        gameSeedHash,
        algoVersion,
        rows,
        await player.getAddress(),
        betAmount
      );
      const tx = await contractAsAny
        .connect(player)
        .createGame('funding-game-2', gameSeedHash, algoVersion, rows, serverSignature, {
          value: betAmount,
        });
      await tx.wait();

      const recipientAddress = await deployer.getAddress(); // Choose any recipient for the test

      try {
        await contractAsAny.connect(player).withdrawFunds(betAmount, recipientAddress);
        expect.fail('Transaction should have failed');
      } catch (error: any) {
        expect(error.message).to.include('reverted');
      }
    });
  });

  describe('Treasury Deposits', function () {
    it('Should accept direct Ether deposits via receive()', async function () {
      const depositAmount = ethers.parseEther('0.1');
      const contractAddress = await deathRaceGame.getAddress();
      const balanceBefore = await provider.getBalance(contractAddress);

      // Send Ether directly to the contract
      const tx = await deployer.sendTransaction({
        to: contractAddress,
        value: depositAmount,
      });
      await tx.wait();

      const balanceAfter = await provider.getBalance(contractAddress);
      const expectedBalance = balanceBefore + depositAmount;

      expect(balanceAfter.toString()).to.equal(
        expectedBalance.toString(),
        'Contract balance did not increase correctly after deposit'
      );
    });
  });
});
