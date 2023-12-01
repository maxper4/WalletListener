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

    ipc.serveNet(config.SERVER_PORT, () => 
    {
        ipc.server.on("ping", (message, socket) => {
            ipc.server.emit(socket, "pong", "pong");
        });
    
        ipc.server.on("test-running", (message, socket) => {
            ipc.server.emit(socket, "test-running", "good");
        });

        ipc.server.on('targets', (message, socket) => {
            ipc.server.emit(socket, 'targets', config.TARGET_ADDRESSES);
        });

        ipc.server.on('add-address', (message, socket) => {
            if(!message.address || config.TARGET_ADDRESSES.includes(message.address)) {
                ipc.server.emit(socket, "added", false);
                return;
            }

            config.TARGET_ADDRESSES.push(message.address);
            saveConfig();
            config = reloadModule("./config.json");
            sendAlert("[WalletListener] Added address: " + message.address);
            console.log("Added address:", message.address);

            ipc.server.emit(socket, "added", true);
        });

        ipc.server.on('remove-address', (message, socket) => {
            if(!message.address || !config.TARGET_ADDRESSES.includes(message.address)) {
                ipc.server.emit(socket, "removed", false);
                return;
            }

            config.TARGET_ADDRESSES = config.TARGET_ADDRESSES.filter((address) => address != message.address);
            saveConfig();
            config = reloadModule("./config.json");
            sendAlert("[WalletListener] Removed address: " + message.address);
            console.log("Removed address:", message.address);

            ipc.server.emit(socket, "removed", true);
        });

        ipc.server.on('transactions', (message, socket) => {
            ipc.server.emit(socket, 'transactions', config.transactions);
        });

        ipc.server.on('remove-transactions', (message, socket) => {
            if(!message.hashes) {
                ipc.server.emit(socket, "removed", false);
                return;
            }

            let removed = true;
            for(let hash of message.hashes) {
                if(!config.transactions.find((tx) => tx.hash == hash)) {
                    removed = false;
                    continue;
                }

                config.transactions = config.transactions.filter((tx) => tx.hash != hash);
                console.log("Removed transaction:", hash);
            }

            saveConfig();
            ipc.server.emit(socket, "removed", removed);
        });

        ipc.server.on('reload', (message, socket) => {
            config = reloadModule("./config.json");
            sendAlert("[WalletListener] Reloaded config");
            console.log("Reloaded config");
        });
    });
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

const onTx = (tx, nameFrom, nameTo) => {
    log = "[WalletListener] New TX at block " + tx.blockNumber + ': ' + tx.hash + " from " + tx.from + (nameFrom ? " (" + nameFrom + ")" : "")
     + " to " + tx.to + (nameTo ? " (" + nameTo + ")" : "") + "\n Explorer: " + (config.EXPLORER_URLs[config.NETWORK] ? config.EXPLORER_URLs[config.NETWORK] + tx.hash : "unavailable");
    sendAlert(log);
    console.log(log);

    config.transactions.push({
        hash: tx.hash,
        url: config.EXPLORER_URLs[config.NETWORK] ? config.EXPLORER_URLs[config.NETWORK] + tx.hash : "",
        from: tx.from,
        to: tx.to ? tx.to : "",
        blockNumber: tx.blockNumber
    });
    saveConfig();
}

const main = async () => {
    connectToContactor();


    const args = process.argv;

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
    sendAlert("[WalletListener] Listening for: " + config.TARGET_ADDRESSES.map((account) => {
        return String(account.address + (account.name ? " (" + account.name + ")" : ""))
    }).join(", "));

    console.log("Starting at block:", blockNumber);
    console.log("[WalletListener] Listening for: " + config.TARGET_ADDRESSES.map((account) => {
        return String(account.address + (account.name ? " (" + account.name + ")" : ""))
    }).join(", "));

    const addresses = config.TARGET_ADDRESSES.map((account) => account.address.toLowerCase());
    const nameFromAddress = {};
    for(let account of config.TARGET_ADDRESSES) {
        nameFromAddress[account.address.toLowerCase()] = account.name;
    }

    provider.on("block", async (blockNumber) => {
        const block = await provider.getBlockWithTransactions(blockNumber);

        for (const tx of block.transactions) {
            if(addresses.includes(tx.from.toLowerCase()) || (tx.to && addresses.includes(tx.to.toLowerCase()))) {
                onTx(tx, nameFromAddress[tx.from.toLowerCase()], tx.to ? nameFromAddress[tx.to.toLowerCase()] : "");
            }
        }
    });
}

main();