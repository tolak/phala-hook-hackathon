const { ethers } = require("ethers");

const CHAIN_ID = 31337;

async function permit(wallet, spendToken, spendAmount, spender) {
    const permit = {
        owner: wallet.address,
        spender: spender,
        value: spendAmount,
        nonce: await spendToken.nonces(wallet.address),
        deadline: ethers.MaxUint256,
    };

    const permitSignature = ethers.Signature.from(
        await wallet.signTypedData(
            {
                name: await spendToken.name(),
                version: "1",
                chainId: CHAIN_ID,
                verifyingContract: spendToken.target,
            },
            {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            permit,
        ),
    );

    const permitParams = [
        permit.owner,
        permit.spender,
        permit.value,
        permit.deadline,
        permitSignature.v,
        permitSignature.r,
        permitSignature.s,
    ];
    
    const permitData = {
        target: spendToken.target,
        callData: spendToken.interface.encodeFunctionData("permit", permitParams),
    };

    return permitData;
}

module.exports = {
    permit,
}