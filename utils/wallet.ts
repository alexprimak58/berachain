import { Hex } from 'viem';
import fs from 'fs';
import { privateKeyToAccount } from 'viem/accounts';

export function convertPrivateKeyToAddress(privateKey: string): Hex {
  const formattedKey = formatPrivateKey(privateKey);
  const account = privateKeyToAccount(formattedKey);
  return account.address;
}

export function formatPrivateKey(privateKey: string): Hex {
  if (privateKey.startsWith('0x')) {
    return privateKey as Hex;
  } else {
    return `0x${privateKey}`;
  }
}

export function readWallets(filePath: string) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    return lines;
  } catch (error) {
    console.error('Error reading the file:', error.message);
    return [];
  }
}
