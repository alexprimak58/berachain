import { Hex, formatEther, parseEther } from 'viem';
import { makeLogger } from '../utils/logger';
import { getEthWalletClient } from '../utils/clients/ethereum';
import {
  MAINNET_RELAY_API,
  ProgressData,
  convertViemChainToRelayChain,
  createClient,
  getClient,
} from '@reservoir0x/relay-sdk';
import { arbitrum, base, linea, mainnet, optimism, zkSync } from 'viem/chains';
import { random, sleep } from '../utils/common';
import { relayBridgeConfig } from '../config';
import { getArbWalletClient } from '../utils/clients/arbitrum';
import { getBaseWalletClient } from '../utils/clients/base';
import { getOptWalletClient } from '../utils/clients/optimism';
import { getZkWalletClient } from '../utils/clients/zkSync';
import { getLineaWalletClient } from '../utils/clients/linea';
import { publicClients } from '../utils/clients';

interface Quote {
  fees: {
    gas: string;
    relayer: string;
  };
}

export class RelayBridge {
  privateKey: Hex;
  logger: any;
  wallet: any;
  client: any;
  ethWallet: any;
  fromNetwork: any;
  destNetwork: any;
  scanUrl: any;

  constructor(privateKey: Hex, fromNetwork?: string) {
    this.privateKey = privateKey;
    this.logger = makeLogger('Relay bridge');
    this.ethWallet = getEthWalletClient(privateKey);

    if (relayBridgeConfig.destNetwork === 'random') {
      this.destNetwork =
        relayBridgeConfig.destNetworks[
          random(0, relayBridgeConfig.destNetworks.length - 1)
        ];
    } else {
      this.destNetwork = relayBridgeConfig.destNetworks.find(
        (network) => network.name === relayBridgeConfig.destNetwork
      );
    }

    if (!fromNetwork) {
      this.fromNetwork = relayBridgeConfig.fromNetwork;
    } else {
      this.fromNetwork = fromNetwork;
    }

    if (this.fromNetwork === 'random') {
      this.fromNetwork =
        relayBridgeConfig.fromNetworks[
          random(0, relayBridgeConfig.fromNetworks.length - 1)
        ];
    } else {
      this.fromNetwork = relayBridgeConfig.fromNetworks.find(
        (network) => network.name === fromNetwork
      );
    }

    switch (this.fromNetwork.name) {
      case 'Arb':
      case 'Arbitrum':
      case 'Arbitrum One':
        this.wallet = getArbWalletClient(privateKey);
        this.scanUrl = 'https://arbiscan.io/tx';
        break;
      case 'Base':
        this.wallet = getBaseWalletClient(privateKey);
        this.scanUrl = 'https://basescan.org/tx';
        break;
      case 'Linea':
        this.wallet = getLineaWalletClient(privateKey);
        this.scanUrl = 'https://lineascan.build/tx';
        break;
      case 'Op':
      case 'Optimism':
        this.wallet = getOptWalletClient(privateKey);
        this.scanUrl = 'https://optimistic.etherscan.io/tx';
        break;
      case 'zkSyncEra':
      case 'zkSync Era':
        this.wallet = getZkWalletClient(privateKey);
        this.scanUrl = 'https://explorer.zksync.io/tx';
        break;
      default:
        throw new Error(`Unsupported network: ${this.fromNetwork.name}`);
    }

    createClient({
      baseApiUrl: MAINNET_RELAY_API,
      source: 'YOUR.SOURCE',
      chains: [
        convertViemChainToRelayChain(mainnet),
        convertViemChainToRelayChain(arbitrum),
        convertViemChainToRelayChain(base),
        convertViemChainToRelayChain(optimism),
        convertViemChainToRelayChain(zkSync),
        convertViemChainToRelayChain(linea),
      ],
    });
  }

  getChainId(): number {
    switch (this.fromNetwork.name) {
      case 'Arbitrum One':
      case 'Arbitrum':
      case 'Arb':
        return 42161;
      case 'Base':
        return 8453;
      case 'Linea':
        return 59144;
      case 'Optimism':
      case 'Op':
        return 10;
      case 'zkSync Era':
      case 'zkSyncEra':
        return 324;
      default:
        throw new Error(`Unsupported network: ${this.fromNetwork}`);
    }
  }

  async getBalance(): Promise<bigint> {
    const chainId = this.getChainId();
    const publicClient = publicClients[chainId];
    const balance = await publicClient.getBalance({
      address: this.wallet.account.address,
    });
    return balance;
  }

  async getBridgeQuote(
    amount: string
  ): Promise<{ totalFee: bigint } | { error: string }> {
    let amountInWei: bigint = parseEther(amount);
    const fromChainId = this.getChainId();

    let isSuccess = false;
    let retryCount = 1;
    while (!isSuccess) {
      try {
        const quote = (await getClient()?.methods.getBridgeQuote({
          wallet: this.wallet,
          chainId: fromChainId,
          toChainId: 1,
          amount: amountInWei.toString(),
          currency: 'eth',
        })) as Quote;
        const gasFee = BigInt(quote.fees.gas);
        const relayerFee = BigInt(quote.fees.relayer);
        const totalFee = gasFee + relayerFee;
        return { totalFee };
      } catch (error) {
        this.logger.error(`Failed to retrieve bridge quote: ${error.message}`);

        if (retryCount <= 3) {
          this.logger.info(
            `${this.wallet.account.address} | Waiting 30 seconds and retrying to get bridge quote. Attempt ${retryCount}/3`
          );
          retryCount++;
          await sleep(30 * 1000);
        } else {
          isSuccess = true;
          this.logger.info(
            `${this.wallet.account.address} | Unable to get a bridge quote after multiple attempts, skip`
          );
        }

        this.logger.error(
          `${this.wallet.account.address} | Relay bridge operation failed: ${error.shortMessage}`
        );
      }
    }

    return { error: 'Unable to get bridge quote after multiple attempts.' };
  }

  async bridgeToEth(
    amount: string
  ): Promise<{ success: boolean; error?: string }> {
    let value: bigint = BigInt(parseEther(amount));
    const fromNetworkName = this.fromNetwork.name;
    const fromNetworkId = this.fromNetwork.id;
    const scanUrl = this.scanUrl;

    let isSuccess = false;
    let retryCount = 1;

    while (!isSuccess) {
      try {
        (await getClient()?.actions.bridge({
          wallet: this.wallet,
          chainId: fromNetworkId,
          toChainId: 1,
          amount: value.toString(),
          currency: 'eth',
          onProgress: ({ steps, txHashes }) => {
            if (
              steps.find((step) =>
                step.items?.every((item) => item.status === 'complete')
              )
            ) {
              this.logger.info(
                `${this.wallet.account.address} | Successful bridge ${fromNetworkName} -> Ethereum: ${scanUrl}/${txHashes?.[0].txHash}`
              );
              isSuccess = true;
            }
          },
        })) as ProgressData;

        return { success: true };
      } catch (error) {
        this.logger.info(
          `${this.wallet.account.address} | Error ${error.shortMessage}`
        );

        if (retryCount <= 3) {
          this.logger.info(
            `${this.wallet.account.address} | Wait 30 sec and retry bridge ${retryCount}/3`
          );
          retryCount++;
          await sleep(30 * 1000);
        } else {
          isSuccess = true;
          this.logger.info(
            `${this.wallet.account.address} | Bridge unsuccessful, skip`
          );
        }

        this.logger.error(
          `${this.wallet.account.address} | Relay bridge error: ${error.shortMessage}`
        );

        return { success: false, error: error.message };
      }
    }

    return {
      success: false,
      error: 'Unknown error occurred during bridge operation.',
    };
  }
}
