import { PublicClient } from 'viem';
import { getPublicLineaClient } from './linea';
import { getPublicArbClient } from './arbitrum';
import { getPublicZkClient } from './zkSync';
import { getPublicBaseClient } from './base';
import { getPublicOptClient } from './optimism';

export const publicClients: { [chainId: number]: PublicClient } = {
  42161: getPublicArbClient(),
  8453: getPublicBaseClient(),
  10: getPublicOptClient(),
  59144: getPublicLineaClient(),
  324: getPublicZkClient(),
};
