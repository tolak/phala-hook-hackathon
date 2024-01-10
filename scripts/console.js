require('dotenv').config();

const { ethers } = require("ethers");
const { program } = require('commander');
const BigNumber = require('bignumber.js');

const { permit } = require('./permit.js');

const ERC20PermitABI = require("./abi/erc20-permit-abi.json");
const ORDERBOOK = require("./orderbook.json");
const CONSTANTS = require("./constants.js");

function run(afn) {
    function runner(...args) {
        afn(...args)
            .then(process.exit)
            .catch(console.error)
            .finally(() => process.exit(-1));
    };
    return runner;
}

function useEtherProvider() {
    return new ethers.JsonRpcProvider(CONSTANTS.ENDPOINT)
}

function useEtherWallet(key) {
    return new ethers.Wallet(key, useEtherProvider())
}

function useERC20Token(token) {
    return new ethers.Contract(
        token,
        ERC20PermitABI,
        useEtherProvider()
    )
}

// Calculate preswap hook data
async function buildHookdata(spendToken, spendAmount, receiveer, receiveToken, receiveAmount) {
    console.log("start building Hookdata...");

    // Construct permit arguments to allow Hook spend spend token from trader wallet
    let traderPermitData = await permit(useEtherWallet(CONSTANTS.TRADER_KEY), spendToken, spendAmount, CONSTANTS.HOOK);
    // Construct permit arguments to allow Hook spend receive token from provider wallet
    let providerPermitData = await permit(useEtherWallet(CONSTANTS.OROVIDER_KEY), receiveToken, receiveAmount, CONSTANTS.HOOK);

    let hookData = {
        token0PermitTarget: traderPermitData.target,
        token0PermitCalldata: traderPermitData.callData,
        token1PermitTarget: providerPermitData.target,
        token1PermitCalldata: providerPermitData.callData,
        token0Amount: spendAmount,
        token1Amount: receiveAmount,
        provider: receiveer,
    };

    console.log(`${JSON.stringify(hookData, null, 2)}`);

    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes', 'address', 'bytes', 'uint256', 'uint256', 'address'],
        [hookData.token0PermitTarget, hookData.token0PermitCalldata, hookData.token1PermitTarget,
        hookData.token1PermitCalldata, hookData.token0Amount, hookData.token1Amount, hookData.provider]
    );
}

const orderbook = program
.command('orderbook')
.description('Orderbook command');

orderbook
    .command('search')
    .description('search orderbook')
    .requiredOption('--spender <sender>', 'Spender address', null)
    .requiredOption('--spend <spendToken>', 'Spend token, should be either `token0` or `token1`', null)
    .requiredOption('--amount <sendAmount>', 'Spend amount', null)
    .action(run(async (opt) => {
        // Search buying order
        if (opt.spend === 'token0') {
            let buyingOrderList = ORDERBOOK.buying;
            for (let i = 0; i < buyingOrderList.length; i++) {
                let buyingOrder = buyingOrderList[i];

                if (new BigNumber(buyingOrder.quantity).dividedBy(new BigNumber(buyingOrder.price)).isGreaterThanOrEqualTo(new BigNumber(opt.amount))) {
                    let hookdata = await buildHookdata(useERC20Token(CONSTANTS.TOKEN0), opt.amount, buyingOrder.buyer, useERC20Token(CONSTANTS.TOKEN1), buyingOrder.quantity);
                    console.log(`🎉 Found matched buying order, following hookdata to swap function:`);
                    console.log(hookdata);
                    return;
                }
            }
            console.log(`Not match selling order found, pass empty hookdata to swap function`);
        }
        // Search selling order
        else if (opt.spend === 'token1') {
            let sellingOrderList = ORDERBOOK.selling;
            for (let i = 0; i < sellingOrderList.length; i++) {
                let sellingOrder = sellingOrderList[i];
                if (new BigNumber(sellingOrder.quantity).dividedBy(new BigNumber(sellingOrder.price)).isGreaterThanOrEqualTo(new BigNumber(opt.amount))) {
                    let hookdata = await buildHookdata(useERC20Token(CONSTANTS.TOKEN1), opt.amount, buyingOrder.buyer, useERC20Token(CONSTANTS.TOKEN0), buyingOrder.quantity);

                    console.log(`🎉 Found matched selling order, following hookdata to swap function:`);
                    console.log(hookdata);
                    return;
                }
            }
            console.log(`Not match selling order found, pass empty hookdata to swap function`);
        } else {
            throw Error("Invalid spend token type")
        }
    }));

program.parse(process.argv);
