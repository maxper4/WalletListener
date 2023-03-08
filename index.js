const { ethers } = require("ethers");
const ipc = require('node-ipc');	   
let config = require("./config.json");
const { writeFileSync } = require("fs");

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

    ipc.serveNet(() => ipc.server.on('alert', (message, socket) => {
        if(message.id == 'add-address') {
            config.TARGET_ADDRESSES.push(message.address);
            saveConfig();
            sendAlert("[WalletListener] Added address: " + message.address);
            console.log("Added address:", message.address);
        }
        else if(message.id == 'remove-address') {
            config.TARGET_ADDRESSES = config.TARGET_ADDRESSES.filter((address) => address != message.address);
            saveConfig();
            sendAlert("[WalletListener] Removed address: " + message.address);
            console.log("Removed address:", message.address);
        }
        else if(message.id == 'reload') {
            config = reloadModule("./config.json");
            sendAlert("[WalletListener] Reloaded config");
            console.log("Reloaded config");
        }
    }));
    ipc.server.start();
};

const reloadModule = (moduleName) => {
    delete require.cache[require.resolve(moduleName)]
    console.log('Reloading ' + moduleName + "...");
    return require(moduleName)
}

const saveConfig = () => {
    writeFileSync("./config.json", JSON.stringify(config, null, 4));
}

const sendAlert = (message) => {
    ipc.of.contactor.emit('alert', JSON.stringify({id: "wallet-listener", message: message}));
}

const onTx = (tx) => {
    sendAlert("[WalletListener] New TX at " + tx.blockNumber + ': ' + tx.hash + " from " + tx.from + " to " + tx.to);
    console.log('New TX at ' + tx.blockNumber + ': ' + tx.hash + " from " + tx.from + " to " + tx.to);
}

const main = async () => {
    connectToContactor();

    const args = process.argv;
    sendAlert("[WalletListener] Args: " + args);

    for(let i = 2; i < args.length; i++) {
        if(!config.TARGET_ADDRESSES.includes(args[i])) {
            config.TARGET_ADDRESSES.push(args[i]);
        }
    }
    saveConfig();

    if(config.TARGET_ADDRESSES.length == 0) {
        console.log("No addresses to listen for. Exiting...");
        process.exit(0);
    }

    const blockNumber = await provider.getBlockNumber();

    sendAlert("[WalletListener] Starting at block: " + blockNumber);
    sendAlert("[WalletListener] Listening for: " + config.TARGET_ADDRESSES.join(", "));

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