// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {BaseTestHooks} from "@uniswap/v4-core/src/test/BaseTestHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract OrderBook is BaseTestHooks {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;

    // NOTE: ---------------------------------------------------------
    // state variables should typically be unique to a pool
    // a single hook contract should be able to service multiple pools
    // ---------------------------------------------------------------

    struct HookParams {
        // EIP-2612 target contract of permit function, essentially is token0 address
        address token0PermitTarget;
        // EIP-2612 calldata of permit function
        bytes token0PermitCalldata;
        // EIP-2612 target contract of permit function, essentially is token1 address
        address token1PermitTarget;
        // EIP-2612 calldata of permit function
        bytes token1PermitCalldata;
        // Trader spend amount, should equal the amount passed from `SwapParams`
        uint256 token0Amount;
        // Offchain order provide amount paired with the trading operation
        uint256 token1Amount;
        // Offchain order provider address
        address provider;
    }

    IPoolManager public immutable poolManager;

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            noOp: true,
            accessLock: false
        });
    }

    /// @notice The hook called before a swap
    /// @param sender The initial msg.sender for the swap call
    /// @param key The key for the pool
    /// @param params The parameters for the swap
    /// @param hookData Arbitrary data handed into the PoolManager by the swapper to be be passed on to the hook
    /// @return bytes4 The function selector for the hook
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4) {
        // If no off-chain order matched, return directly to fallback to AMM pool
        if (hookData.length == 0) return BaseTestHooks.beforeSwap.selector;

        // Else extract the order parameters, for now, we just support single privider, multiple
        // providers support technically doable with anditional computation
        HookParams memory hookParams = abi.decode(hookData, (HookParams));

        // Check spend amount
        require(uint256(params.amountSpecified) == hookParams.token0Amount, "Spend amount mismatch");
        require(hookParams.token0PermitTarget == Currency.unwrap(key.currency0), "Spend asset mismatch");
        require(hookParams.token1PermitTarget == Currency.unwrap(key.currency1), "Receive asset mismatch");

        // Approve hook contract for spending of token0 from trader wallet
        erc20Permit(hookParams.token0PermitTarget, hookParams.token0PermitCalldata);
        // Approve hook contract for spending of token1 from provider wallet
        erc20Permit(hookParams.token1PermitTarget, hookParams.token1PermitCalldata);

        // Transfer receive assert from order provider to trader
        IERC20(hookParams.token1PermitTarget).safeTransferFrom(hookParams.provider, sender, hookParams.token1Amount);
        // Transfer spend asset from trader to provider
        IERC20(hookParams.token0PermitTarget).safeTransferFrom(sender, hookParams.provider, hookParams.token0Amount);

        // TODO: potential some fee collection

        // Now we skip the swap operation
        return Hooks.NO_OP_SELECTOR;
    }

    function erc20Permit(address target, bytes memory permitCallData) private {
        (bool success, bytes memory returnData) = target.call(permitCallData);
        require(success, string(abi.encodePacked(string("Permit approve failed: "), string(returnData))));
    }
}
