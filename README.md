# Wallet Listener

Bot listening transaction and notifying you (thanks to the contactor bot) when there is an interaction with from or to specified addresses.

## Installation

1. Clone the repository
2. Install the dependencies with `npm install`
3. Create a `config.json` file with the following content:

```
{ 
    "SERVER_PORT": 4001,
    "NETWORK": "mainnet",
    "RPC_URLs": 
    {
        "mainnet": "url to a json rpc mainnet node" 
    },
    "EXPLORER_URLs": {
        "mainnet": "https://etherscan.io/tx/"
    },
    "TARGET_ADDRESSES": [
        "address1", "address2", ...
    ],
    "transactions": []
}
```

4. Run the bot with `npm start`