import {
  orderbookConfig,
  poolManagerConfig,
  poolModifyLiquidityTestConfig,
  poolSwapTestConfig,
  token0Address,
  token1Address,
} from "~~/generated/generated";

export const TOKEN_ADDRESSES = [token0Address, token1Address];

export const DEBUGGABLE_ADDRESSES = [
  { ...orderbookConfig, name: "OrderBook" },
  { ...poolManagerConfig, name: "PoolManager" },
  { ...poolModifyLiquidityTestConfig, name: "PoolModifyLiquidityTest" },
  { ...poolSwapTestConfig, name: "PoolSwapTest" },
];
