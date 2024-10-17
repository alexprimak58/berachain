export const generalConfig = {
  ethrpc: 'https://rpc.ankr.com/eth',
  baserpc: 'https://rpc.ankr.com/base',
  sleepWithdrawFrom: 1,
  sleepWithdrawTo: 5,
  sleepModulesFrom: 10,
  sleepModulesTo: 15,
  sleepWalletsFrom: 10,
  sleepWalletsTo: 15,
  shuffleWallets: false,
  shuffleCustomModules: true,
  maxGas: 15,
  useTopup: false,
  topupValues: {
    Arb: {
      min: 0.00104,
      max: 0.0015,
    },
    Base: {
      min: 0.00204,
      max: 0.0025,
    },
    Linea: {
      min: 0.0003,
      max: 0.0005,
    },
    Op: {
      min: 0.00014,
      max: 0.0005,
    },
    zkSyncEra: {
      min: 0.000141,
      max: 0.0005,
    },
  },
};

export const amountConfig = {
  DEPOSIT_HONEY_AMOUNT: {
    min: 90,
    max: 100,
  },
};

export const capSolverConfig = {
  key: 'CAP-808CF28731A7AC8D3728D86428A11923',
  proxyUrl: '',
};

export const okxConfig = {
  key: '',
  secret: '',
  passphrase: '',
  proxy: '',
  destNetwork: 'random', //or set 1 network
  destNetworks: ['Arbitrum One', 'Base', 'Optimism', 'zkSync Era', 'Linea'],
  coin: 'ETH',
  useRefill: false,
};

export const relayBridgeConfig = {
  networksToCheck: ['Arb', 'Base', 'Linea', 'Op', 'zkSyncEra'],
  //bridge to ETH
  fromNetwork: 'random', //or set 1 network
  fromNetworks: [
    {
      name: 'Arb',
      id: 42161,
    },
    {
      name: 'Base',
      id: 8453,
    },
    {
      name: 'Linea',
      id: 59144,
    },
    {
      name: 'Op',
      id: 10,
    },
    {
      name: 'zkSyncEra',
      id: 324,
    },
  ],
  //bridge from ETH
  destNetwork: 'random', //or set 1 network
  destNetworks: [
    {
      name: 'Arb',
      id: 42161,
    },
    {
      name: 'Base',
      id: 8453,
    },
    {
      name: 'Linea',
      id: 59144,
    },
    {
      name: 'Op',
      id: 10,
    },
    {
      name: 'zkSyncEra',
      id: 324,
    },
  ],
};
