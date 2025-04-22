import * as hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Wallet } from 'zksync-ethers';
// import { vars } from 'hardhat/config'; // No longer using hardhat vars for private key
import { Deployer } from '@matterlabs/hardhat-zksync';
import { LOCAL_RICH_WALLETS } from './utils';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv'; // Import dotenv

dotenv.config(); // Load environment variables from .env file

// Deploy script for DeathRaceGame contract
export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script for DeathRaceGame...`);

  // Get the deployer wallet from environment variable
  const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
  if (!PRIVATE_KEY) {
    throw new Error(
      'WALLET_PRIVATE_KEY not set in environment variables (.env file). Please set it.'
    );
  }
  const deployerWallet = new Wallet(PRIVATE_KEY); // Assumes zksync-ethers Wallet

  // === Add Funding Logic Here ===
  // Check if the network is one of the local development networks
  const localNetworkNames = ['localhost', 'hardhat', 'inMemoryNode'];
  if (localNetworkNames.includes(hre.network.name)) {
    console.log(`\nNetwork is local (${hre.network.name}). Checking deployer balance...`);
    const deployerAddress = deployerWallet.address;
    const provider = hre.ethers.provider; // Get default provider

    // Get a rich wallet signer
    const richWalletSigner = await provider.getSigner(LOCAL_RICH_WALLETS[0].address);

    const balanceWei = await provider.getBalance(deployerAddress);
    const balanceEther = ethers.formatEther(balanceWei);
    const requiredEther = 1.0; // Minimum balance needed
    const fundingAmountEther = 10.0; // Amount to send if needed

    console.log(`Deployer (${deployerAddress}) balance: ${balanceEther} ETH`);

    if (parseFloat(balanceEther) < requiredEther) {
      console.log(
        `Balance low. Funding deployer account from rich wallet ${LOCAL_RICH_WALLETS[0].address}...`
      );
      const fundingAmountWei = ethers.parseEther(fundingAmountEther.toString());
      const tx = await richWalletSigner.sendTransaction({
        to: deployerAddress,
        value: fundingAmountWei,
      });
      console.log(`Funding transaction sent: ${tx.hash}`);
      await tx.wait(); // Wait for transaction confirmation
      const newBalanceWei = await provider.getBalance(deployerAddress);
      console.log(`Deployer account funded. New balance: ${ethers.formatEther(newBalanceWei)} ETH`);
    } else {
      console.log('Deployer balance sufficient.');
    }
    console.log('---'); // Separator
  }
  // === End Funding Logic ===

  // Connect the deployer wallet to the provider (using the deployer instance)
  const deployer = new Deployer(hre, deployerWallet);

  // Load the artifact
  console.log('Loading artifact: DeathRaceGame...');
  const artifact = await deployer.loadArtifact('DeathRaceGame');
  console.log('Artifact loaded.');

  let contractAddress: string; // Declare contractAddress here

  // === Add Pre-Deploy Balance Check ===
  try {
    const balanceWei = await deployer.zkWallet.getBalance();
    console.log(`Balance right before deploy: ${ethers.formatEther(balanceWei)} ETH`);
    if (balanceWei === 0n) {
      // Use strict check for 0n
      console.error('Deployer account still has zero balance before deployment attempt!');
      // Optionally throw an error here if needed
      // throw new Error('Deployer has zero balance');
    }
  } catch (balanceError) {
    console.error('Error checking balance right before deploy:', balanceError);
  }
  // === End Pre-Deploy Check ===

  // Deploy the contract
  console.log(`Deploying ${artifact.contractName} with account: ${deployer.zkWallet.address}...`);
  try {
    const deathRaceGameContract = await deployer.deploy(artifact);
    console.log('deployer.deploy call completed. Waiting for deployment...'); // Added log
    await deathRaceGameContract.waitForDeployment();
    console.log('waitForDeployment completed.'); // Added log

    contractAddress = await deathRaceGameContract.getAddress(); // Assign here
    console.log(`✅ ${artifact.contractName} deployed to ${contractAddress}`);
  } catch (deployError) {
    console.error(`\n❌ Deployment failed:`, deployError);
    // Log more details if available
    if (deployError instanceof Error) {
      console.error('Error Message:', deployError.message);
      console.error('Stack Trace:', deployError.stack);
    }
    // Re-throw the error if you want the script to exit with non-zero code
    throw deployError;
  }

  // Instructions for manual verification
  if (contractAddress) {
    console.log('\n---');
    console.log('✅ Deployment successful!');
    console.log(`Contract Address: ${contractAddress}`);
    console.log('\nTo verify the contract, run the following command:');
    // Customize the command based on the network
    const verifyCommand = `npx hardhat verify --network ${hre.network.name} ${contractAddress}`;
    console.log(`\n  ${verifyCommand}\n`);
    if (hre.network.name === 'abstractTestnet') {
      console.log('(Using Abstract Sepolia Testnet settings)');
    } else if (hre.network.name === 'abstractMainnet') {
      console.log('(Using Abstract Mainnet settings)');
    } else {
      console.log(`(Verification might not be configured for network: ${hre.network.name})`);
    }
    console.log('---');
  } else {
    console.warn(
      '\n⚠️ Deployment seems to have failed, contract address not obtained. Skipping verification instructions.'
    );
  }
}
