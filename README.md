![Resupply Button](https://imgroovin.github.io/Star-Atlas-Resupply/resupply_all_ships.png "Resupply Button")

# Star Atlas Auto Resupply by Shadow's Legacy [SLY]
This is a browser-based script to automatically resupply Star Atlas ships on a recurring basis (once per day for 7 days) with a single approval.

The __single approval component__ is accomplished by leveraging the solana wallet-adapter function [signAllTransactions](https://solana-labs.github.io/wallet-adapter/classes/_solana_wallet_adapter_base.BaseSignerWalletAdapter.html#signAllTransactions). In an effort to increase efficiency, this script will also pack multiple instructions into each transaction, reducing transaction fees.

The __recurring component__ is accomplished by leveraging [Durable Transaction Nonce Accounts](https://docs.solana.com/implemented-proposals/durable-tx-nonces). These accounts store a nonce which can be used in place of a recent blockhash. They are intended for use in signing offline transactions. Here, those accounts are used to configure several "resupply" transaction ahead of time; allowing the user to sign all of the transactions at once.

### Durable Transaction Nonce Accounts
Each account is required to be rent-exempt, so it requires a deposit of 0.00144768 SOL.
Each account can only be used for one offline transaction at a time; so a separate account is required for each future transaction to be queued. Additionally, each ship type also requires a separate transaction due to Solana transaction size limits.
* Automatically resupplying 10 Fimbul Airbikes for 7 days requires 6 accounts (the first transaction doesn't use a nonce account)
* Automatically resupplying 1 Fimbul Airbike and 1 Pearce X4 for 7 days requires 12 accounts

The initial deposit can be reclaimed by issuing a withdraw transaction for the exact amount deposited (Click Configure > Reclaim Rent).

### SECURITY NOTICE
Users are encouraged to build their own instance of a browser-compatible Star Atlas Factory - Score file. Doing so ensures that you are using trusted code. A pre-built file is provided for convenience. 

### Building your own browserified version
This script uses a browserified version of [Star Atlas Factory](https://github.com/staratlasmeta/factory). 

```
browserify sa-score.js --standalone BrowserScore -p esmify --exclude process -o staratlas-score-browserified.js
```

sa-score.js
```
const score = require("@staratlas/factory/dist/score");
module.exports = {score};
```

### Usage
The script is built as a TamperMonkey script. [TamperMonkey](https://www.tampermonkey.net/) is a userscript manager available for free as a browser extension.

1. Install TamperMonkey
2. Select the star-atlas-resupply.user.js file in this repo. View the file and click the "Raw" button to view its source.
3. Copy the source
4. Open Tampermonkey in your browser and click the Add Script tab (icon with a plus symbol)
5. Paste the source into the script window and click File > Save
6. Browse to https://play.staratlas.com/fleet
7. Click the "Configure" button, then the "Create Accounts" button
8. Wait a minute or two for the accounts to populate, then close the Configure window
9. Click the "Resupply All Ships" button
10. __Leave the browser window open (it can be minimized)__ - this is required since the script runs in the browser

NOTE: The ship supplies displayed on the Fleet page will not reflect updated supplies while the script is running.

### Credit
* [vlaslaptev](https://github.com/vlaslaptev) for the star_atlas_bot which provides an excellent example of how to interact with the Star Atlas Score module.
* Blulce81 for pointing out the proper Solana API endpoint.
