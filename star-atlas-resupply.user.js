// ==UserScript==
// @name         Star Atlas Resupply
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Efficiently resupply all Star Atlas ships
// @author       Groove
// @match        https://api.mainnet-beta.solana.com/
// @require      https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js
// @require      https://imgroovin.github.io/Star-Atlas-Resupply/staratlas-score-browserified.js
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'));
    //const connection = new solanaWeb3.Connection(GM_xmlhttpRequest('https://api.mainnet-beta.solana.com/'));
    let userPublicKey = null;

    // Extracted from https://play.staratlas.com/fleet - __NEXT_DATA__.runtimeConfig.NEXT_PUBLIC_SCORE_PROGRAM_ID
    const scoreProgId = new solanaWeb3.PublicKey('FLEET1qqzpexyaDpqb2DGsSzE2sDCizewCg9WjrA6DBW');

    // Extracted from https://play.staratlas.com/_next/static/chunks/pages/_app-e2c1cc6c24994724.js
    const tokenProgramId = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const toolTokenMint = "tooLsNYLiVqzg8o4m3L2Uetbn62mvMWRqkog6PQeYKL";
    const fuelTokenMint = "fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim";
    const foodTokenMint = "foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG";
    const ammoTokenMint = "ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK";

    async function sendTransactions(txInstructions) {
        let transactions = [];
        let respSigs = [];
        let tx = null;

        // Solana transactions have an MTU size of 1280 bytes.
        // We should be able to safely fit two instructions into each transaction.
        for (let i = 0; i < txInstructions.length; i++) {
            if (tx == null) {
                tx = new solanaWeb3.Transaction().add(txInstructions[i]);
            } else {
                tx.add(txInstructions[i])
            }
            if (tx.instructions.length > 1 || i == txInstructions.length-1) {
                tx.recentBlockhash = (await connection.getRecentBlockhash('finalized')).blockhash;
                tx.feePayer = userPublicKey;
                transactions.push(tx);
                tx = null;
            }
        }

        // This allows us to sign all of the transactions with just one approval.
        // The downside is that most wallets don't provide an estimate when using this method.
        const signedTransactions = await window.solana.signAllTransactions(transactions);

        // Note that we make no efforts to retry failed transactions.
        for (let i = 0; i < signedTransactions.length; i++) {
            const result = await connection.sendRawTransaction(signedTransactions[i].serialize());
            respSigs.push(result);
        }

        // This is not strictly necessary, but it may help troubleshoot issues.
        await new Promise(resolve => setTimeout(resolve, 60000));
        let res = await connection.getSignatureStatuses(respSigs);
        console.log("Transaction statuses: ", res);
    }

    // Extract the tokenMint for each resource associated with the user's account
    function getTokenPublicKey(tokenAccountInfo, tokenMint) {
        return tokenAccountInfo.value.filter(function (v) {
            return v.account.data.parsed.info.mint === tokenMint
        })[0].pubkey;
    }

    // Use the Star Atlas convenience functions to build the appropriate Instructions
    async function getResupplyInstruction(createInstruction, quantity, shipMint, supplyTokenMint, supplyTokenAcct) {
        return await createInstruction(
            connection, userPublicKey, userPublicKey, quantity, shipMint,
            new solanaWeb3.PublicKey(supplyTokenMint),
            supplyTokenAcct, scoreProgId
        );
    }

    async function ExecuteResupplyAll() {
        let txInstructions = [];

        // Request a connection to the default Solana Wallet
        let walletConn = await window.solana.connect();
        userPublicKey = walletConn.publicKey;
        let tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(
            userPublicKey, {programId: tokenProgramId}, 'confirmed'
        );
        let toolTokenAcct = getTokenPublicKey(tokenAccountInfo, toolTokenMint);
        let fuelTokenAcct = getTokenPublicKey(tokenAccountInfo, fuelTokenMint);
        let foodTokenAcct = getTokenPublicKey(tokenAccountInfo, foodTokenMint);
        let ammoTokenAcct = getTokenPublicKey(tokenAccountInfo, ammoTokenMint);

        let shipStakingInfo = await BrowserScore.score.getAllFleetsForUserPublicKey(connection, userPublicKey, scoreProgId);
        for (let i = 0; i < shipStakingInfo.length; i++) {
            const nowTS = new Date().getTime() / 1000;

            // Calculate the maximum amount of each resources necessary to refuel each ship
            // NOTE: The SCORE programs will not allow over-supply, so there is no risk of waste by using a larger quantity than necessary
            let shipInfo = await BrowserScore.score.getScoreVarsShipInfo(connection, scoreProgId, shipStakingInfo[i].shipMint)
            let toolReserve = shipStakingInfo[i].healthCurrentCapacity / (shipInfo.millisecondsToBurnOneToolkit / 1000)
            let toolSpent = (nowTS - shipStakingInfo[i].repairedAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneToolkit / 1000)
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRepairInstruction, (shipInfo.toolkitMaxReserve - (toolReserve - toolSpent)) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, toolTokenMint, toolTokenAcct));
            let armsReserve = shipStakingInfo[i].armsCurrentCapacity / (shipInfo.millisecondsToBurnOneArms / 1000)
            let armsSpent = (nowTS - shipStakingInfo[i].armedAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneArms / 1000)
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRearmInstruction, (shipInfo.armsMaxReserve - (armsReserve - armsSpent)) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, ammoTokenMint, ammoTokenAcct));
            let fuelReserve = shipStakingInfo[i].fuelCurrentCapacity / (shipInfo.millisecondsToBurnOneFuel / 1000)
            let fuelSpent = (nowTS - shipStakingInfo[i].fueledAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneFuel / 1000)
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRefuelInstruction, (shipInfo.fuelMaxReserve - (fuelReserve - fuelSpent)) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, fuelTokenMint, fuelTokenAcct));
            let foodReserve = shipStakingInfo[i].foodCurrentCapacity / (shipInfo.millisecondsToBurnOneFood / 1000)
            let foodSpent = (nowTS - shipStakingInfo[i].fedAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneFood / 1000)
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRefeedInstruction, (shipInfo.foodMaxReserve - (foodReserve - foodSpent)) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, foodTokenMint, foodTokenAcct));
        }
        await sendTransactions(txInstructions);
    }

    // Create a Resupply All Ships button
    let resupplyAll = document.createElement ('div');
    resupplyAll.innerHTML = '<button id="browserResupplyAll">Resupply All Ships</button>';
    resupplyAll.setAttribute ('id', 'browserResupplyAllContainer');
    document.body.appendChild(resupplyAll);
    document.getElementById ("browserResupplyAll").addEventListener("click", ExecuteResupplyAll, false);
})();
