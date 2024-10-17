import { getPublicEthClient } from './clients/ethereum';

export async function getWalletBalance(
  walletAddress: `0x${string}`
): Promise<number> {
  const client = getPublicEthClient();
  const balance = await client.getBalance({ address: walletAddress });

  const formattedBalance = Number(balance) / 1e18;

  return formattedBalance;
}
