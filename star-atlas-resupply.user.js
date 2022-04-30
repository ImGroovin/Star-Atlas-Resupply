// ==UserScript==
// @name         Star Atlas Resupply
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Efficiently resupply all Star Atlas ships
// @author       Groove
// @match        https://play.staratlas.com/*
// @require      https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js
// @require      https://imgroovin.github.io/Star-Atlas-Resupply/staratlas-score-browserified.js
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_listValues
// ==/UserScript==

(function() {
    'use strict';
    
    // Other RPC endpoints for testing
    // 'https://solana-api.projectserum.com'
    // 'https://ssc-dao.genesysgo.net'
    const connection = new solanaWeb3.Connection('https://solana-api.syndica.io/access-token/PlxlrbctMxm5qsacltZqGtVhUcPMbTqqema0uKb3CGxNrxhLWCJXYIDYhhU9xljH/rpc');

    // Extracted from https://play.staratlas.com/fleet - __NEXT_DATA__.runtimeConfig.NEXT_PUBLIC_SCORE_PROGRAM_ID
    const scoreProgramId = new solanaWeb3.PublicKey('FLEET1qqzpexyaDpqb2DGsSzE2sDCizewCg9WjrA6DBW');

    // Extracted from https://play.staratlas.com/_next/static/chunks/pages/_app-e2c1cc6c24994724.js
    const tokenProgramId = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const toolTokenMint = "tooLsNYLiVqzg8o4m3L2Uetbn62mvMWRqkog6PQeYKL";
    const fuelTokenMint = "fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim";
    const foodTokenMint = "foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG";
    const ammoTokenMint = "ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK";

    let userPublicKey = null;
    let autoResupplyColor = '1px solid #ff0000';
    let autoResupplyStatus = 'Auto Resupply Inactive';

    async function LoadModalContent() {
        let modalBodyContent = 'Current Durable Transaction Accounts: <ul>';
        for (let i = 0; i < GM_listValues().length; i++) {
            modalBodyContent += '<li>' + GM_listValues()[i] + '</li>'
        }
        modalBodyContent += '</ul>';
        if (document.getElementById("modalBodyContent")) {
            document.getElementById("modalBodyContent").innerHTML = modalBodyContent;
        }
    }

    async function LoadWallet() {
        // Request a connection to the default Solana Wallet
        let walletConn = await solana.connect();
        userPublicKey = walletConn.publicKey;
    }

    async function CreateAccounts() {
        let shipStakingInfo = await BrowserScore.score.getAllFleetsForUserPublicKey(connection, userPublicKey, scoreProgramId);
        let txInstructions = [];
        let nonceAccounts = [];
        let rentExempt = await connection.getMinimumBalanceForRentExemption(solanaWeb3.NONCE_ACCOUNT_LENGTH)

        for (let i = 0; i < shipStakingInfo.length * 6; i++) {
            let noncePadding = new Uint8Array(Array.from(i.toString().padStart(4, '0'), Number));
            let nonceSeed = Uint8Array.from([...noncePadding, ...userPublicKey.toBytes().slice(0, 28)]);
            let nonceAccount = solanaWeb3.Keypair.fromSeed(nonceSeed);
            nonceAccounts.push(nonceAccount);
            txInstructions.push(
                // create nonce account
                solanaWeb3.SystemProgram.createAccount({
                    fromPubkey: userPublicKey,
                    newAccountPubkey: nonceAccount.publicKey,
                    lamports: rentExempt,
                    space: solanaWeb3.NONCE_ACCOUNT_LENGTH,
                    programId: solanaWeb3.SystemProgram.programId,
                }),
                // init nonce account
                solanaWeb3.SystemProgram.nonceInitialize({
                    noncePubkey: nonceAccount.publicKey, // nonce account pubkey
                    authorizedPubkey: userPublicKey, // nonce account auth
                })
            );
        }
        let txResults = await signTransactions(txInstructions, 8, false, nonceAccounts, 'CreateAccounts');
        let resultIdx = 0;
        for (let i = 0; i < txResults.value.length; i++) {
            if (txResults.value[i] && !txResults.value[i].err) {
                for (let j = 0; j < 4; j++) {
                    if (resultIdx >= nonceAccounts.length) {
                        break;
                    }
                    console.log('ACCOUNT CREATED: ' + nonceAccounts[resultIdx].publicKey.toBase58());
                    GM_setValue(nonceAccounts[resultIdx].publicKey.toBase58(), rentExempt);
                    resultIdx++;
                }
            }
        }
        LoadModalContent();
    }

    // This is a failsafe in case Nonce Accounts are lost. This is a VERY long query, and certain RPC endpoints will timeout before it completes.
    //    This really shouldn't be necessary, as account creation is done in a deterministic fashion.
    async function FindAccounts() {
        const accounts = await connection.getParsedProgramAccounts(
            solanaWeb3.SystemProgram.programId, // Nonce Accounts are owned by the System Program
            {
                dataSlice: { // reducing the data returned, since we're only interested in the pubKey
                    offset: 0,
                    length: 0,
                },
                filters: [
                    {
                        dataSize: 80, // Nonce Accounts are 80 bytes
                    },
                    {
                        memcmp: {
                            offset: 8, // the Authorized pubkey starts at offset 8
                            bytes: userPublicKey.toBase58(), // base58 encoded string
                        },
                    },
                ],
            }
        );
        let nonceAcctList = [];
        for (let i = 0; i < accounts.length; i++) {
            let acctPubkey = accounts[i].pubkey.toBase58();
            nonceAcctList.push(acctPubkey);
            console.log(acctPubkey);
        }
    }

    async function CloseAccounts() {
        let acctList = GM_listValues();
        let txInstructions = [];

        for (let i = 0; i < acctList.length; i++) {
            txInstructions.push(solanaWeb3.SystemProgram.nonceWithdraw({
                        authorizedPubkey: userPublicKey,
                        noncePubkey: new solanaWeb3.PublicKey(acctList[i]),
                        lamports: GM_getValue(acctList[i]),
                        toPubkey: userPublicKey,
                    }));
        }
        let txResults = await signTransactions(txInstructions, 7, false, false, 'CloseAccounts');
        let resultIdx = 0;
        for (let i = 0; i < txResults.value.length; i++) {
            if (txResults.value[i] && !txResults.value[i].err) {
                for (let j = 0; j < 7; j++) {
                    if (resultIdx >= acctList.length) {
                        break;
                    }
                    console.log('ACCOUNT CLOSED: ' + acctList[resultIdx]);
                    GM_deleteValue(acctList[resultIdx]);
                    resultIdx++;
                }
            }
        }
        LoadModalContent();
    }

    async function sendTransactions(txBatch, skipPreflight) {
        let respSigs = [];

        // Note that we make no efforts to retry failed transactions.
        for (let i = 0; i < txBatch.length; i++) {
            let result = null;
            if (skipPreflight === true) {
                result = await connection.sendRawTransaction(txBatch[i].serialize(), {skipPreflight: true,});
            } else {
                result = await connection.sendRawTransaction(txBatch[i].serialize());
            }
            respSigs.push(result);
        }
        console.log('Sent transactions:', respSigs);

        // This is not strictly necessary, but it may help troubleshoot issues.
        await new Promise(resolve => setTimeout(resolve, 60000));
        let res = await connection.getSignatureStatuses(respSigs);
        console.log("Transaction statuses: ", res);
        return res;
    }

    async function signTransactions(txInstructions, maxInstructions, queueFuture, createAccounts, txType) {
        let transactions = [];
        let tx = null;

        // Solana transactions have an MTU size of 1280 bytes.
        // We should be able to safely fit four resupply instructions into each transaction (and still have room for a nonceAdvance instruction).
        for (let i = 0; i < txInstructions.length; i++) {
            if (tx == null) {
                tx = new solanaWeb3.Transaction().add(txInstructions[i]);
            } else {
                tx.add(txInstructions[i])
            }
            if (tx.instructions.length >= maxInstructions || i == txInstructions.length-1) {
                tx.recentBlockhash = (await connection.getRecentBlockhash('finalized')).blockhash;
                tx.feePayer = userPublicKey;
                transactions.push(tx);
                tx = null;
            }
        }

        // Leveraging nonce accounts to create offline transactions to be sent later
        if (queueFuture === true) {
            let acctList = GM_listValues();
            let instructionIdx = 0;
            for (let i = 0; i < acctList.length; i++) {
                let noncePubKey = new solanaWeb3.PublicKey(acctList[i]);
                let accountInfo = await connection.getAccountInfo(noncePubKey);
                let nonceAccount = solanaWeb3.NonceAccount.fromAccountData(accountInfo.data);
                for (instructionIdx; instructionIdx < txInstructions.length; instructionIdx++) {
                    if (tx == null) {
                        tx = new solanaWeb3.Transaction().add(
                            solanaWeb3.SystemProgram.nonceAdvance({
                                noncePubkey: noncePubKey,
                                authorizedPubkey: userPublicKey,
                            }));
                    }
                    tx.add(txInstructions[instructionIdx])
                    if (tx.instructions.length > maxInstructions || instructionIdx == txInstructions.length-1) {
                        tx.recentBlockhash = nonceAccount.nonce;
                        tx.feePayer = userPublicKey;
                        transactions.push(tx);
                        tx = null;
                        instructionIdx++
                        break;
                    }
                }
                if (instructionIdx == txInstructions.length) {
                    instructionIdx = 0;
                }
            }
        }

        // This allows us to sign all of the transactions with just one approval.
        // The downside is that most wallets don't provide an estimate when using this method.
        const signedTransactions = await solana.signAllTransactions(transactions);
        console.log('Signed transactions: ', signedTransactions);

        // The transaction to create a nonce account requires a signature from the nonce account itself as well as the authorized account
        let signatureIdx = 0
        let multiSigTxs = []
        if (createAccounts) {
            for (let i = 0; i < signedTransactions.length; i++) {
                let userSig = signedTransactions[i].signatures[0];
                for (let j = 0; j < signedTransactions[i].signatures.length-1; j++) {
                    signedTransactions[i].partialSign(createAccounts[signatureIdx]);
                    signatureIdx++;
                }
            }
        }

        let txBatchSize = Math.ceil(txInstructions.length/maxInstructions);
        let txBatches = [];
        for (let i = 0; i < signedTransactions.length; i += txBatchSize) {
            const batch = signedTransactions.slice(i, i + txBatchSize);
            txBatches.push(batch);
        }

        let txResults = sendTransactions(txBatches[0], false);
        switch (txType) {
            case 'Resupply':
                autoResupplyStatus = 'Active [Day 1 of ' + txBatches.length + ']';
                break;
            case 'CloseAccounts':
                autoResupplyStatus = 'Reclaiming Rent';
                break;
            case 'CreateAccounts':
                autoResupplyStatus = 'Creating Accounts';
                break;
        }
        autoResupplyColor = '1px solid #00ff00';
        if (document.getElementById("resupplyStatus")) {
            document.getElementById("resupplyStatus").style.border = autoResupplyColor;
            document.getElementById("resupplyStatus").innerHTML = autoResupplyStatus;
        }

        if (queueFuture === false) {
            return txResults;
        }

        function sendBatch(i) {
            if (i < txBatches.length) {
                let resupplyInterval = setTimeout(() => {
                    sendTransactions(txBatches[i], true);
                    autoResupplyStatus = 'Active [Day ' + (i+1) + ' of ' + txBatches.length + ']';
                    if (document.getElementById("resupplyStatus")) {
                        document.getElementById("resupplyStatus").innerHTML = autoResupplyStatus;
                    }
                    i++;
                    sendBatch(i);
                }, 60000 * 60 * 24);
            } else {
                autoResupplyStatus = 'Auto Resupply Inactive';
                autoResupplyColor = '1px solid #ff0000';
                if (document.getElementById("resupplyStatus")) {
                    document.getElementById("resupplyStatus").style.border = autoResupplyColor;
                    document.getElementById("resupplyStatus").innerHTML = autoResupplyStatus;
                }
            }
        }
        sendBatch(1);
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
            supplyTokenAcct, scoreProgramId
        );
    }

    async function ExecuteResupplyAll() {
        let txInstructions = [];
        autoResupplyStatus = 'Activating Auto Resupply';
        autoResupplyColor = '1px solid #00ff00';
        document.getElementById("resupplyStatus").style.border = autoResupplyColor;
        document.getElementById("resupplyStatus").innerHTML = autoResupplyStatus;

        let tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(
            userPublicKey, {programId: tokenProgramId}, 'recent'
        );
        let toolTokenAcct = getTokenPublicKey(tokenAccountInfo, toolTokenMint);
        let fuelTokenAcct = getTokenPublicKey(tokenAccountInfo, fuelTokenMint);
        let foodTokenAcct = getTokenPublicKey(tokenAccountInfo, foodTokenMint);
        let ammoTokenAcct = getTokenPublicKey(tokenAccountInfo, ammoTokenMint);

        let shipStakingInfo = await BrowserScore.score.getAllFleetsForUserPublicKey(connection, userPublicKey, scoreProgramId);
        for (let i = 0; i < shipStakingInfo.length; i++) {
            const nowTS = new Date().getTime() / 1000;

            // Calculate the maximum amount of each resources necessary to refuel each ship
            // NOTE: The SCORE programs will not allow over-supply, so there is no risk of waste by using a larger quantity than necessary
            let shipInfo = await BrowserScore.score.getScoreVarsShipInfo(connection, scoreProgramId, shipStakingInfo[i].shipMint)
            let toolReserve = shipStakingInfo[i].healthCurrentCapacity / (shipInfo.millisecondsToBurnOneToolkit / 1000);
            let toolSpent = (nowTS - shipStakingInfo[i].repairedAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneToolkit / 1000);
            let tool24hr = (3600 * 24 * 1000) / shipInfo.millisecondsToBurnOneToolkit;
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRepairInstruction, Math.max((shipInfo.toolkitMaxReserve - (toolReserve - toolSpent)), tool24hr) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, toolTokenMint, toolTokenAcct));
            let armsReserve = shipStakingInfo[i].armsCurrentCapacity / (shipInfo.millisecondsToBurnOneArms / 1000);
            let armsSpent = (nowTS - shipStakingInfo[i].armedAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneArms / 1000);
            let arms24hr = (3600 * 24 * 1000) / shipInfo.millisecondsToBurnOneArms;
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRearmInstruction, Math.max((shipInfo.armsMaxReserve - (armsReserve - armsSpent)), arms24hr) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, ammoTokenMint, ammoTokenAcct));
            let fuelReserve = shipStakingInfo[i].fuelCurrentCapacity / (shipInfo.millisecondsToBurnOneFuel / 1000);
            let fuelSpent = (nowTS - shipStakingInfo[i].fueledAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneFuel / 1000);
            let fuel24hr = (3600 * 24 * 1000) / shipInfo.millisecondsToBurnOneFuel;
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRefuelInstruction, Math.max((shipInfo.fuelMaxReserve - (fuelReserve - fuelSpent)), fuel24hr) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, fuelTokenMint, fuelTokenAcct));
            let foodReserve = shipStakingInfo[i].foodCurrentCapacity / (shipInfo.millisecondsToBurnOneFood / 1000);
            let foodSpent = (nowTS - shipStakingInfo[i].fedAtTimestamp.toNumber()) / (shipInfo.millisecondsToBurnOneFood / 1000);
            let food24hr = (3600 * 24 * 1000) / shipInfo.millisecondsToBurnOneFood;
            txInstructions.push(await getResupplyInstruction(BrowserScore.score.createRefeedInstruction, Math.max((shipInfo.foodMaxReserve - (foodReserve - foodSpent)), food24hr) * shipStakingInfo[i].shipQuantityInEscrow, shipStakingInfo[i].shipMint, foodTokenMint, foodTokenAcct));
        }
        await signTransactions(txInstructions, 4, true, false, 'Resupply');
    }

    // Create a basic Resupply All Ships button
    /*
    let resupplyAll = document.createElement ('div');
    resupplyAll.innerHTML = '<button id="browserResupplyAll">Resupply All Ships</button>';
    resupplyAll.setAttribute ('id', 'browserResupplyAllContainer');
    document.body.appendChild(resupplyAll);
    document.getElementById ("browserResupplyAll").addEventListener("click", ExecuteResupplyAll, false);
    */

    // Add a themed Resupply All Ships button to the SA Fleet page
    let observer = new MutationObserver(waitForFleet);
    function waitForFleet(mutations, observer){
        if(document.querySelectorAll('#fleetManagementContainer button').length > 0 && !document.getElementById("browserResupplyAllContainer")) {
            LoadWallet();

            let allButtons = document.querySelectorAll('#fleetManagementContainer button');
            let lightButton = [...allButtons].find(e => e.innerText == "MANAGE FLEET");
            let lightSpans = lightButton.querySelectorAll('span');
            let lightSpan = [...lightSpans].find(e => e.innerText == "MANAGE FLEET");
            let darkButton = [...allButtons].find(e => e.innerText == "VIEW IN MARKET");
            let darkSpans = darkButton.querySelectorAll('span');
            let darkSpan = [...darkSpans].find(e => e.innerText == "VIEW IN MARKET");

            let resupplyAll = document.createElement('div');
            resupplyAll.setAttribute ('id', 'browserResupplyAllContainer');
            resupplyAll.style.display = 'flex';
            resupplyAll.style.flexDirection = 'column';
            resupplyAll.style.alignItems = 'center';
            let resupplyStatus = document.createElement('div');
            resupplyStatus.setAttribute ('id', 'resupplyStatus');
            resupplyStatus.style.background = '#222129';
            resupplyStatus.style.border = autoResupplyColor;
            resupplyStatus.style.color = '#ffffff';
            resupplyStatus.style.borderRadius = '10px';
            resupplyStatus.style.height = '30px';
            resupplyStatus.style.lineHeight = '25px';
            resupplyStatus.style.padding = '0 10px 0 10px';
            resupplyStatus.innerHTML = autoResupplyStatus;
            let configureResupply = document.createElement('button');
            configureResupply.classList.add(...darkButton.classList);
            configureResupply.setAttribute ('id', 'configureResupply');
            configureResupply.style.margin = '10px';
            let createAcctSpan = document.createElement('span');
            createAcctSpan.innerText = 'Configure';
            createAcctSpan.style.fontSize = '14px';
            let resupplyButton = document.createElement('button');
            resupplyButton.classList.add(...lightButton.classList);
            resupplyButton.setAttribute ('id', 'browserResupplyAll');
            let resupplySpan = document.createElement('span');
            resupplySpan.innerText = 'Resupply All Ships';
            resupplySpan.style.fontSize = '14px';
            resupplySpan.classList.add(...lightSpan.classList);
            configureResupply.appendChild(createAcctSpan);
            resupplyButton.appendChild(resupplySpan);
            resupplyAll.appendChild(resupplyStatus);
            resupplyAll.appendChild(configureResupply);
            resupplyAll.appendChild(resupplyButton);
            let targetElem = document.querySelectorAll('[class^="FleetHeaderstyles__Gradient"]');
            targetElem[0].appendChild(resupplyAll);

            let resupplyModal = document.createElement('div');
            resupplyModal.setAttribute ('id', 'resupplyModal');
            resupplyModal.style.display = 'none';
            resupplyModal.style.background = '#1b1a22';
            resupplyModal.style.border = '1px solid';
            resupplyModal.style.borderRadius = '8px 8px 48px';
            resupplyModal.style.width = '75%';
            resupplyModal.style.textAlign = 'left';
            resupplyModal.style.flexDirection = 'column';
            resupplyModal.style.alignItems = 'center';
            resupplyModal.style.padding = '10px';
            resupplyModal.innerHTML = '<button type="button" id="resupplyModalClose" class="close ' + [...darkButton.classList].join(' ') + '" style="align-self: flex-end; width: 30px;" aria-hidden="true">X</button><h3>Auto Resupply</h3><div><p>Each Durable Transaction Nonce Account must pay "Rent" to Solana. Current rent is 0.00144768 SOL per account.</p><div id="modalBodyContent"></div></div><div style="display: flex; flex-direction: row;" ><button id="createAccounts" class="' + [...darkButton.classList].join(' ') + '" style="margin: 10px;" aria-hidden="true">Create Accounts</button><button id="findAccounts" class="' + [...darkButton.classList].join(' ') + '" style="margin: 10px;">Find Accounts</button><button id="closeAccounts" class="' + [...darkButton.classList].join(' ') + '" style="margin: 10px;">Reclaim Rent</button></div>'
            targetElem[0].appendChild(resupplyModal);
            document.getElementById("configureResupply").addEventListener("click", function() {
                document.getElementById("resupplyModal").style.display = 'inline-flex';
                LoadModalContent();
            }, false);
            document.getElementById("resupplyModalClose").addEventListener("click", function() {document.getElementById("resupplyModal").style.display = 'none';}, false);
            document.getElementById("browserResupplyAll").addEventListener("click", ExecuteResupplyAll, false);
            document.getElementById("createAccounts").addEventListener("click", CreateAccounts, false);
            document.getElementById("findAccounts").addEventListener("click", FindAccounts, false);
            document.getElementById("closeAccounts").addEventListener("click", CloseAccounts, false);
        }
    }
    observer.observe(document, {childList: true, subtree: true});
})();
