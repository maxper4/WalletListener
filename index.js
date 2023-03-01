const { ethers } = require("ethers");
const ipc = require('node-ipc');	   
const config = require("./config.json");

const provider = new ethers.providers.JsonRpcProvider(config.RPC_URLs[config.NETWORK]);

const connectToContactor = () => {
    ipc.config.id = 'wallet-listener';
    ipc.config.retry = 1500;
    ipc.config.silent = true;
    ipc.connectToNet('contactor', () => {
        ipc.of.contactor.on('connect', () => {
            console.log('Connected to contactor');
        });
    });
};

const onTx = (tx) => {
    ipc.of.contactor.emit('alert', "[WalletListener] New TX at " + tx.blockNumber + ': ' + tx.hash + " from " + tx.from + " to " + tx.to);
    console.log('New TX at ' + tx.blockNumber + ': ' + tx.hash + " from " + tx.from + " to " + tx.to);
}

const main = async () => {
    connectToContactor();

    const blockNumber = await provider.getBlockNumber();

    ipc.of.contactor.emit('alert', "[WalletListener] Starting at block: " + blockNumber);

    let addresses_str = "[WalletListener] Listening for: " + config.TARGET_ADDRESSES.join(", ");

    ipc.of.contactor.emit('alert', addresses_str);

    console.log("Starting at block:", blockNumber);
    console.log("Listening for:", config.TARGET_ADDRESSES.join(", "));

    provider.on("block", async (blockNumber) => {
        const block = await provider.getBlockWithTransactions(blockNumber);

        for (const tx of block.transactions) {
            if(config.TARGET_ADDRESSES.includes(tx.from.toLowerCase()) || (tx.to && config.TARGET_ADDRESSES.includes(tx.to.toLowerCase()))) {
                onTx(tx);
            }
        }
    });
}

main();