import { formatEther, Hex, parseEther } from 'viem';
import { makeLogger } from '../../utils/logger';
import { getEthWalletClient } from '../../utils/clients/ethereum';
import { BERPS_ABI, BERPS_CONTRACTS } from '../../abi/berps';
import { TOKENS_PER_CHAIN, TOKENS_PER_CHAIN_ABI } from '../../abi/tokens';

const BERPS_ROUTER_ADDRESS: Hex = BERPS_CONTRACTS['router'] as Hex;
const BHONEY_ADDRESS: Hex = TOKENS_PER_CHAIN['BeraChain']['bHONEY'] as Hex;

export class Berps {
  privateKey: Hex;
  berpsRouterAddress: Hex = BERPS_ROUTER_ADDRESS;
  bhoneyAddress: Hex = BHONEY_ADDRESS;
  logger: any;
  wallet: any;

  // ABI контрактов
  berpsRouterAbi: any = BERPS_ABI['router'];
  bhoneyAbi: any = TOKENS_PER_CHAIN_ABI['BeraChain']['bHONEY'];

  constructor(privateKey: Hex) {
    this.privateKey = privateKey;
    this.logger = makeLogger('Berps');
    this.wallet = getEthWalletClient(privateKey);
  }

  // Метод для депозита HONEY
  async depositHoney(amount: string) {
    const amountInWei: bigint = parseEther(amount);

    this.logger.info(
      `${this.wallet.account.address} | Deposit ${amount} ETH ($HONEY) to Berps Vault`
    );

    try {
      // Построение транзакции для депозита
      const transaction = await this.wallet.writeContract({
        address: this.berpsRouterAddress,
        abi: this.berpsRouterAbi,
        functionName: 'deposit',
        args: [amountInWei, this.wallet.account.address],
        value: 0n, // Если требуется отправить ETH, укажите значение
      });

      this.logger.info(
        `${this.wallet.account.address} | Deposit transaction sent: https://etherscan.io/tx/${transaction}`
      );

      // Ожидание подтверждения транзакции (опционально)
      // const receipt = await this.wallet.waitForTransactionReceipt({ hash: transaction });
      // if (receipt.status === 1n) {
      //   this.logger.info(`Deposit successful: ${transaction}`);
      // } else {
      //   this.logger.error(`Deposit failed: ${transaction}`);
      // }
    } catch (error: any) {
      this.logger.error(
        `${this.wallet.account.address} | Deposit HONEY Error: ${
          error.message || error
        }`
      );
    }
  }

  // Метод для вывода bHONEY (начало процесса)
  async withdrawBhoney() {
    // Получение баланса bHONEY
    const amountInWei: bigint = await this.getTokenBalance('bHONEY');

    const amountInEth = formatEther(amountInWei);

    this.logger.info(
      `${this.wallet.account.address} | Withdraw ${amountInEth} bHONEY from Berps Vault`
    );

    try {
      // Построение транзакции для вывода
      const transaction = await this.wallet.writeContract({
        address: this.berpsRouterAddress,
        abi: this.berpsRouterAbi,
        functionName: 'makeWithdrawRequest',
        args: [amountInWei],
        value: 0n, // Если требуется отправить ETH, укажите значение
      });

      this.logger.info(
        `${this.wallet.account.address} | Withdraw request sent: https://etherscan.io/tx/${transaction}`
      );

      // Ожидание подтверждения транзакции (опционально)
      // const receipt = await this.wallet.waitForTransactionReceipt({ hash: transaction });
      // if (receipt.status === 1n) {
      //   this.logger.info(`Withdraw request successful: ${transaction}`);
      // } else {
      //   this.logger.error(`Withdraw request failed: ${transaction}`);
      // }
    } catch (error: any) {
      this.logger.error(
        `${this.wallet.account.address} | Withdraw bHONEY Error: ${
          error.message || error
        }`
      );
    }
  }

  async withdrawBhoneyFinally() {
    try {
      const amountInWei: bigint = await this.getCompleteBalanceOf();

      const amountInEth = formatEther(amountInWei);

      this.logger.info(
        `${this.wallet.account.address} | Final withdraw ${amountInEth} bHONEY from Berps Vault`
      );

      const transaction = await this.wallet.writeContract({
        address: this.bhoneyAddress,
        abi: this.bhoneyAbi,
        functionName: 'redeem',
        args: [
          amountInWei,
          this.wallet.account.address,
          this.wallet.account.address,
        ],
        value: 0n,
      });

      this.logger.info(
        `${this.wallet.account.address} | Final withdraw transaction sent: https://etherscan.io/tx/${transaction}`
      );

      // Ожидание подтверждения транзакции (опционально)
      // const receipt = await this.wallet.waitForTransactionReceipt({ hash: transaction });
      // if (receipt.status === 1n) {
      //   this.logger.info(`Final withdraw successful: ${transaction}`);
      // } else {
      //   this.logger.error(`Final withdraw failed: ${transaction}`);
      // }
    } catch (error: any) {
      this.logger.error(
        `${this.wallet.account.address} | Final withdraw bHONEY Error: ${
          error.message || error
        }`
      );
    }
  }

  // Метод для получения и требования токенов BGT
  async claimBgt() {
    try {
      // Получение доступного количества BGT
      const pendingBGT: number = await this.getPendingBGT();

      // Рассчитываем 99% от доступного BGT
      const amountInWei: bigint = BigInt(
        Math.floor(pendingBGT * 0.99 * 10 ** 18)
      );

      const amountInEth = formatEther(amountInWei);

      this.logger.info(
        `${this.wallet.account.address} | Claim ${amountInEth} BGT on Berps Vault`
      );

      // Построение транзакции для требования BGT
      const txHash = await this.wallet.writeContract({
        address: this.berpsRouterAddress,
        abi: this.berpsRouterAbi,
        functionName: 'claimBGT',
        args: [amountInWei, this.wallet.account.address],
        value: 0n, // Если требуется отправить ETH, укажите значение
      });

      this.logger.info(
        `${this.wallet.account.address} | Claim BGT transaction sent: https://etherscan.io/tx/${txHash}`
      );

      // Ожидание подтверждения транзакции (опционально)
      // const receipt = await this.wallet.waitForTransactionReceipt({ hash: transaction });
      // if (receipt.status === 1n) {
      //   this.logger.info(`Claim BGT successful: ${transaction}`);
      // } else {
      //   this.logger.error(`Claim BGT failed: ${transaction}`);
      // }
    } catch (error: any) {
      this.logger.error(
        `${this.wallet.account.address} | Claim BGT Error: ${
          error.message || error
        }`
      );
    }
  }

  // Вспомогательный метод для проверки одобрения токена
  private async checkForApproved(
    fromTokenAddress: Hex,
    spenderAddress: Hex,
    amount: bigint
  ) {
    // Реализуйте логику проверки и одобрения токена, если это необходимо
    // Например, вызов функции approve на токене
    // Пример:
    // const allowance: bigint = await this.wallet.readContract({
    //   address: fromTokenAddress,
    //   abi: erc20Abi,
    //   functionName: 'allowance',
    //   args: [this.wallet.account.address, spenderAddress],
    // });
    // if (allowance < amount) {
    //   await this.wallet.writeContract({
    //     address: fromTokenAddress,
    //     abi: erc20Abi,
    //     functionName: 'approve',
    //     args: [spenderAddress, amount],
    //   });
    // }
  }

  // Вспомогательный метод для получения баланса токена
  private async getTokenBalance(tokenName: string): Promise<bigint> {
    // Реализуйте логику получения баланса токена
    // Пример:
    // const tokenAddress = TOKENS_PER_CHAIN[this.network][tokenName];
    // const balance: bigint = await this.wallet.readContract({
    //   address: tokenAddress,
    //   abi: erc20Abi,
    //   functionName: 'balanceOf',
    //   args: [this.wallet.account.address],
    // });
    // return balance;
    return 0n; // Замените на реальную реализацию
  }

  // Вспомогательный метод для получения окончательного баланса bHONEY
  private async getCompleteBalanceOf(): Promise<bigint> {
    // Реализуйте логику вызова функции completeBalanceOf
    // Пример:
    // const balance: bigint = await this.wallet.readContract({
    //   address: this.bhoneyAddress,
    //   abi: this.bhoneyAbi,
    //   functionName: 'completeBalanceOf',
    //   args: [this.wallet.account.address],
    // });
    // return balance;
    return 0n; // Замените на реальную реализацию
  }

  // Вспомогательный метод для получения доступного количества BGT
  private async getPendingBGT(): Promise<number> {
    // Реализуйте логику вызова функции pendingBGT
    // Пример:
    // const pending: bigint = await this.wallet.readContract({
    //   address: this.berpsRouterAddress,
    //   abi: this.berpsRouterAbi,
    //   functionName: 'pendingBGT',
    //   args: [this.wallet.account.address],
    // });
    // return Number(pending) / 10 ** 18;
    return 0; // Замените на реальную реализацию
  }
}
