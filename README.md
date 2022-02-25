# Star-Atlas-Resupply
This is a browser-based script to resupply Star Atlas ships with a single approval. This is accomplished by leveraging the solana wallet-adapter function [signAllTransactions](https://solana-labs.github.io/wallet-adapter/classes/_solana_wallet_adapter_base.BaseSignerWalletAdapter.html#signAllTransactions). In an effort to increase efficiency, this script will also pack two instructions into each transaction, reducing transaction fees.

Due to CORS restrictions on the https://play.staratlas.com/ site, this script adds a button to the homepage at https://api.mainnet-beta.solana.com/.

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
6. Browse to https://api.mainnet-beta.solana.com/
7. Click the "Resupply All Ships" button
