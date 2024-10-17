import Table from 'cli-table3';
import { getWalletBalance } from './utils/getWalletBalance';
import {
  convertPrivateKeyToAddress,
  formatPrivateKey,
  readWallets,
} from './utils/wallet';
import { waitGas } from './utils/getCurrentGas';
import {
  normalizeNetworkName,
  random,
  randomFloat,
  shuffleWallets,
  sleep,
} from './utils/common';
import {
  amountConfig,
  generalConfig,
  okxConfig,
  relayBridgeConfig,
} from './config';
import { makeLogger } from './utils/logger';
import { entryPoint } from './utils/menu';
import { CaptchaSolver } from './modules/captchaSolver';
import { OKX } from './modules/okx';
import { RelayBridge } from './modules/relayBridge';
import { formatEther, parseEther } from 'viem';
import { Berps } from './modules/perps/berps';

let privateKeys = readWallets('./keys.txt');

if (generalConfig.shuffleWallets) {
  shuffleWallets(privateKeys);
}

async function berachainFaucetModule() {
  const logger = makeLogger('Berachain Faucet');

  const errorRequests: Record<string, string> = {};
  const successfulRequests: Record<string, string> = {};
  const cooldownRequests: Record<string, string> = {};

  const totalWallets = privateKeys.length;
  let successful = 0;
  let cooldown = 0;
  let failed = 0;

  for (let privateKey of privateKeys) {
    let sleepTime;
    const address = convertPrivateKeyToAddress(privateKey);
    let balance = await getWalletBalance(address);
    const targetBalance = 0.001;

    if (await waitGas()) {
      if (balance >= targetBalance) {
        logger.info(
          `${address} | Current balance: ${balance} ETH, requesting tokens...`
        );

        const captchaSolver = new CaptchaSolver(address);
        await captchaSolver.requestTokens();

        successful += Object.keys(captchaSolver.successfulRequest).length;
        Object.assign(successfulRequests, captchaSolver.successfulRequest);

        cooldown += Object.keys(captchaSolver.cooldownRequest).length;
        Object.assign(cooldownRequests, captchaSolver.cooldownRequest);

        failed += Object.keys(captchaSolver.errorRequest).length;
        Object.assign(errorRequests, captchaSolver.errorRequest);
      } else {
        logger.info(
          `${address} | Balance ${balance} ETH is too small, checking other networks...`
        );

        const missingAmount = targetBalance - balance;
        let isBridged = false;

        for (let networkName of relayBridgeConfig.networksToCheck) {
          const networkKey = normalizeNetworkName(networkName);

          if (!networkKey) {
            logger.info(
              `${address} | Network ${networkName} is not supported...`
            );
            continue;
          }

          const relayBridge = new RelayBridge(
            formatPrivateKey(privateKey),
            networkName
          );

          const networkBalance = await relayBridge.getBalance();
          const missingAmountInWei = parseEther(missingAmount.toString());

          try {
            const bridgeQuote = await relayBridge.getBridgeQuote(
              missingAmount.toString()
            );

            if ('totalFee' in bridgeQuote) {
              const totalAmountNeeded =
                missingAmountInWei + bridgeQuote.totalFee;
              if (networkBalance >= totalAmountNeeded) {
                logger.info(
                  `${address} | Found sufficient balance on ${networkName}, bridging ${missingAmount} ETH to Ethereum...`
                );

                const totalAmountNeededInEther = formatEther(totalAmountNeeded);

                const bridgeResult = await relayBridge.bridgeToEth(
                  totalAmountNeededInEther
                );

                if (bridgeResult.success) {
                  logger.info(
                    `${address} | Bridging successful, waiting for funds to arrive...`
                  );

                  sleepTime = random(
                    generalConfig.sleepModulesFrom,
                    generalConfig.sleepModulesFrom
                  );
                  await sleep(sleepTime * 1000);
                  balance = await getWalletBalance(address);

                  if (balance >= targetBalance) {
                    isBridged = true;
                    break;
                  } else {
                    logger.info(
                      `${address} | Balance did not update after bridging.`
                    );
                  }
                } else {
                  logger.info(
                    `${address} | Bridging from ${networkName} failed: ${bridgeResult.error}`
                  );
                }
              } else {
                const balanceInEth = formatEther(networkBalance);
                const requiredEth = formatEther(totalAmountNeeded);
                logger.info(
                  `${address} | Network ${networkName}: Balance = ${balanceInEth} ETH is insufficient because it's less than the required ${requiredEth} ETH...`
                );
              }
            } else {
              logger.info(
                `${address} | Error in bridge quote: ${bridgeQuote.error}`
              );
            }
          } catch (error) {
            logger.error(
              `${address} | Error getting bridge quote on ${networkName}: ${error.message}`
            );
          }
        }

        if (!isBridged) {
          logger.info(
            `${address} | Attempting to withdraw funds from exchange...`
          );

          let destNetwork: string;
          if (okxConfig.destNetwork === 'random') {
            destNetwork =
              okxConfig.destNetworks[
                random(0, okxConfig.destNetworks.length - 1)
              ];
          } else {
            destNetwork = okxConfig.destNetwork;
          }

          const networkKey = normalizeNetworkName(destNetwork);
          if (!networkKey) {
            logger.info(
              `${address} | Network ${destNetwork} is not supported...`
            );
            continue;
          }
          const topupConfig = generalConfig.topupValues[networkKey];
          const sum = randomFloat(topupConfig.min, topupConfig.max);
          const okx = new OKX(formatPrivateKey(privateKey), destNetwork);
          const withdrawalResult = await okx.withdraw(sum.toString());

          sleepTime = random(
            generalConfig.sleepWithdrawFrom,
            generalConfig.sleepWithdrawTo
          );
          logger.info(
            `${address} | Waiting ${sleepTime} sec until next module...`
          );
          await sleep(sleepTime * 1000);

          if (withdrawalResult.success) {
            let fromNetwork = withdrawalResult.network;

            if (fromNetwork) {
              switch (fromNetwork) {
                case 'Arbitrum One':
                  fromNetwork = 'Arb';
                  break;
                case 'Base':
                  fromNetwork = 'Base';
                  break;
                case 'Optimism':
                  fromNetwork = 'Op';
                  break;
                case 'zkSync Era':
                  fromNetwork = 'zkSyncEra';
                  break;
                case 'Linea':
                  fromNetwork = 'Linea';
                  break;
                default:
                  logger.info(
                    `${address} | Network ${fromNetwork} not recognized...`
                  );
                  continue;
              }

              const relayBridge = new RelayBridge(
                formatPrivateKey(privateKey),
                fromNetwork
              );

              await relayBridge.bridgeToEth(sum.toString());
              logger.info(
                `${address} | Waiting for balance update after bridging...`
              );
              await sleep(sleepTime * 1000);
              balance = await getWalletBalance(address);
            } else {
              logger.info(
                `${address} | Withdrawal failed: ${withdrawalResult.error}. Skipping to next wallet...`
              );
              continue;
            }
          } else {
            logger.info(
              `${address} | Withdrawal from exchange failed: ${withdrawalResult.error}. Skipping to next wallet...`
            );
            continue;
          }
        }

        if (balance >= targetBalance) {
          logger.info(
            `${address} | New balance: ${balance} ETH, requesting tokens...`
          );

          const captchaSolver = new CaptchaSolver(address);
          await captchaSolver.requestTokens();

          successful += Object.keys(captchaSolver.successfulRequest).length;
          Object.assign(successfulRequests, captchaSolver.successfulRequest);

          cooldown += Object.keys(captchaSolver.cooldownRequest).length;
          Object.assign(cooldownRequests, captchaSolver.cooldownRequest);

          failed += Object.keys(captchaSolver.errorRequest).length;
          Object.assign(errorRequests, captchaSolver.errorRequest);
        } else {
          logger.info(
            `${address} | Balance is still too low after bridging/withdrawal. Skipping to next wallet...`
          );
          continue;
        }
      }
    }

    sleepTime = random(
      generalConfig.sleepModulesFrom,
      generalConfig.sleepModulesTo
    );

    logger.info(`${address} | Waiting ${sleepTime} sec until next wallet...`);
    await sleep(sleepTime * 1000);
  }

  const table = new Table({
    head: ['Wallets', 'Successful', 'Cooldown', 'Failed'],
    colAligns: ['right', 'right', 'right', 'right'],
  });

  table.push([
    totalWallets.toString(),
    successful.toString(),
    cooldown.toString(),
    failed.toString(),
  ]);

  logger.info('\n' + table.toString());
}

async function berpsModule() {
  const logger = makeLogger('Berps Module');

  for (let privateKey of privateKeys) {
    let sleepTime;
    const address = convertPrivateKeyToAddress(privateKey);

    const amount = random(
      amountConfig.DEPOSIT_HONEY_AMOUNT.min,
      amountConfig.DEPOSIT_HONEY_AMOUNT.max
    );
    const berps = new Berps(formatPrivateKey(privateKey));
    berps.withdrawBhoney();

    sleepTime = random(
      generalConfig.sleepModulesFrom,
      generalConfig.sleepModulesTo
    );

    logger.info(`${address} | Waiting ${sleepTime} sec until next wallet...`);
    await sleep(sleepTime * 1000);
  }
}

async function startMenu() {
  let mode = await entryPoint();
  switch (mode) {
    case 'berachain_faucet':
      await berachainFaucetModule();
      break;
    case 'berps':
      await berpsModule();
      break;
  }
}

await startMenu();
