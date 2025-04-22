import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';

dotenv.config(); // Load .env file contents into process.env

import '@matterlabs/hardhat-zksync';
import '@matterlabs/hardhat-zksync-deploy';
import '@matterlabs/hardhat-zksync-solc';
import '@matterlabs/hardhat-zksync-verify';
import '@nomicfoundation/hardhat-toolbox-viem'; // Added for Viem integration

// Define rich wallets directly in the config file to avoid import issues
const LOCAL_RICH_WALLETS = [
  {
    address: '0x36615Cf349d7F6344891B1e7CA7C72883F5dc049',
    privateKey: '0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110',
  },
  {
    address: '0xa61464658AfeAf65CccaaFD3a512b69A83B77618',
    privateKey: '0xac1e735be8536c6534bb4f17f06f6afc73b2b5ba84ac2cfb12f7461b20c0bbe3',
  },
  {
    address: '0x3d3cbc973389cb26f657686445bcc75662b415b656078503592ac8c1abb8810e',
    privateKey: '0x3d3cbc973389cb26f657686445bcc75662b415b656078503592ac8c1abb8810e',
  },
];

// Use the first rich wallet from the predefined list
const RICH_WALLET = LOCAL_RICH_WALLETS[0];

const config: HardhatUserConfig = {
  defaultNetwork: 'inMemoryNode',
  networks: {
    abstractTestnet: {
      url: 'https://api.testnet.abs.xyz',
      ethNetwork: 'sepolia',
      zksync: true,
    },
    inMemoryNode: {
      url: 'http://127.0.0.1:8011',
      ethNetwork: 'localhost', // in-memory node doesn't support eth node; removing this line will cause an error
      zksync: true,
      accounts: [
        RICH_WALLET.privateKey,
        LOCAL_RICH_WALLETS[1].privateKey,
        LOCAL_RICH_WALLETS[2].privateKey,
      ],
    },
    hardhat: {
      zksync: true,
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: '',
      },
    },
  },
  zksolc: {
    version: '1.5.12',
    settings: {
      enableEraVMExtensions: true,
      codegen: 'evmla',
      optimizer: {
        enabled: true,
        mode: 'z',
        fallback_to_optimizing_for_size: true,
      },
    },
  },
  solidity: {
    version: '0.8.24',
  },
  etherscan: {
    // API key is optional for Abstract testnet verification
    apiKey: {
      // Using the example key from Abstract docs
      abstractTestnet: 'TACK2D1RGYX9U7MC31SZWWQ7FCWRYQ96AD',
      abstractMainnet: process.env.ABSCAN_MAINNET_API_KEY || 'YOUR_MAINNET_KEY', // Add placeholder for mainnet
    },
    customChains: [
      {
        network: 'abstractTestnet',
        chainId: 11124,
        urls: {
          apiURL: 'https://api-sepolia.abscan.org/api', // From Abstract Docs
          browserURL: 'https://sepolia.abscan.org/', // From Abstract Docs
        },
      },
      {
        network: 'abstractMainnet', // Add mainnet config from docs
        chainId: 2741,
        urls: {
          apiURL: 'https://api.abscan.org/api',
          browserURL: 'https://abscan.org/',
        },
      },
    ],
  },
};

export default config;
