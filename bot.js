// requires
const c = require('./constants.js');
const u = require('./utils.js');
const l = require('ergo-lib-wasm-nodejs');
const a = require('axios');
const ar = require('axios-retry');
const fs = require('fs');
const p = require('path');
const { time } = require('console');

// params
const LOOP_ITNERVAL_MS = (process.env && process.env.LOOP_ITNERVAL_MS) ? parseInt(process.env.LOOP_ITNERVAL_MS) : 180000;
const WORK_FILE_PATH = (process.env && process.env.WORK_FILE_PATH) ? process.env.WORK_FILE_PATH : '/tmp/lastBlockHeight';
const INIT_BLOCK_HEIGHT = (process.env && process.env.INIT_BLOCK_HEIGHT) ? parseInt(process.env.INIT_BLOCK_HEIGHT) : 1061730;
const BLOCKS_PER_CALL = (process.env && process.env.BLOCKS_PER_CALL) ? parseInt(process.env.BLOCKS_PER_CALL) : 50;
const TELEGRAM_BOT_TOKEN = (process.env && process.env.TELEGRAM_BOT_TOKEN) ? process.env.TELEGRAM_BOT_TOKEN : '';
const TELEGRAM_GROUP_ID = (process.env && process.env.TELEGRAM_GROUP_ID) ? process.env.TELEGRAM_GROUP_ID : '';
const SECOND_TELEGRAM_GROUP_ID = (process.env && process.env.SECOND_TELEGRAM_GROUP_ID) ? process.env.SECOND_TELEGRAM_GROUP_ID : '';

// run
async function run() {
    ar(a, { retries: 6, retryDelay: 20000 });
    const minerFeeAddress = await l.MinerAddress.mainnet_fee_address();
    do {
        // get last block height
        if (!fs.existsSync(WORK_FILE_PATH)) { fs.writeFileSync(WORK_FILE_PATH, INIT_BLOCK_HEIGHT.toString()); }
        let lastBlockHeight = parseInt(fs.readFileSync(WORK_FILE_PATH));
        let offset = lastBlockHeight;
        let blockInfos;

        try {
            do {
                // get blocks
                blockInfos = (await a.get(`${c.EXPLORER_API_URL}api/v1/blocks?limit=${BLOCKS_PER_CALL}&offset=${offset}&sortBy=height&sortDirection=asc`)).data.items;
                for (let blockInfo of blockInfos) {
                    if (blockInfo.height <= lastBlockHeight) { 
                        break; 
                    }
                    const block = (await a.get(`${c.EXPLORER_API_URL}api/v1/blocks/${blockInfo.id}`)).data;
                    let blockTime = (new Date(blockInfo.timestamp)).toISOString().replace('T',' ').replace('Z','');
        
                    // process spectrum existing pools txs
                    const txs = block.block.blockTransactions.filter(t => t.inputs.some(i => i.address === c.N2T_ADDRESS || i.address === c.T2T_ADDRESS) && t.outputs.some(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS));
                    for (let tx of txs) {
                        console.log('tx.inputs[0]:', tx.inputs[0]);
                        console.log('tx.inputs[1]:', tx.inputs[1]);
                        // get input boxes and details
                        const poolBoxIndex = tx.inputs.findIndex(i => i.address === c.N2T_ADDRESS || i.address === c.T2T_ADDRESS);
                        const orderBoxIndex = (poolBoxIndex === 0) ? 1 : 0;
                        const prevPoolBox = (await a.get(`${c.EXPLORER_API_URL}api/v1/boxes/${tx.inputs[poolBoxIndex].id}`)).data;
                        const orderBox = (await a.get(`${c.EXPLORER_API_URL}api/v1/boxes/${tx.inputs[orderBoxIndex].id}`)).data;
                        const orderDetails = await u.getOrderDetails(orderBox);
        
                        const poolBox = tx.outputs.filter(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS)[0];
                        const minerBox = tx.outputs.filter(o => o.address === minerFeeAddress)[0];
                        const rewardBox = tx.outputs[1];
                        const operatorBox = (tx.outputs.length > 3) ? tx.outputs[2] : undefined;
        
                        // calc
                        let tokenDiffs = [];
                        let ergDiff = (parseInt((BigInt(prevPoolBox.value) - BigInt(poolBox.value))) * 1.0 / c.NANOERG);
                        for (let token of poolBox.assets) {
                            const amount = token.amount
                            const prevAmount = (prevPoolBox.assets.filter(t => t.tokenId === token.tokenId)[0]).amount;
                            const diffAmount = (prevAmount - amount) / Math.pow(10, token.decimals);
                            if (diffAmount !== 0) {
                                tokenDiffs.push({ 'tokenId': token.tokenId, 'name': (token.name) ? token.name : token.tokenId, 'amount': diffAmount })
                            }
                        }
        
                        // Construct the const txs = 
                        let message = ` <b> ${orderDetails.orderType}</b>  <i><a href="https://ergexplorer.com/transactions/${tx.id}">Details</a></i>\n`;

                        // in logic
                        if (ergDiff < 0) {
                            message += `${ergDiff} <b>ERG</b>\n`;
                        }
                        for (let tokenOrder of orderBox.assets) {
                            let tokenDiff = tokenDiffs.find((t) => t.tokenId === tokenOrder.tokenId);
                            if (tokenDiff && tokenDiff.amount < 0) {
                                message += `${tokenDiff.amount} <b>${tokenDiff.name}</b>\n`;
                            }
                        }

                        // out logic
                        if (ergDiff > 0) {
                            message += `+${ergDiff} <b>ERG</b>\n`;
                        }
                        for (let tokenDiff of tokenDiffs) {
                            let tokenOrder = orderBox.assets.find((t) => t.tokenId === tokenDiff.tokenId);
                            if (!tokenOrder && tokenDiff.amount > 0) {
                                message += `+${tokenDiff.amount} <b>${tokenDiff.name}</b>\n`;
                            }
                            // SPF buy when SPF fee exception
                            if (orderDetails.feeType === 'spf' && tokenDiff.name === 'SPF' && tokenDiff.amount > 0) {
                                message += `+${tokenDiff.amount} <b>${tokenDiff.name}</b>\n`;
                            }
                        }

                        // Send the message to the Telegram group
                        u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID);
                        u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, SECOND_TELEGRAM_GROUP_ID);
                    }

                    // process spectrum new pool txs
                    const newTxs = block.block.blockTransactions.filter(t => !t.inputs.some(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS) && t.outputs.some(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS));
                    for (let tx of newTxs) {
                        let message = ` <b> LP creation</b>  <i><a href="https://ergexplorer.com/transactions/${tx.id}">Details</a></i>\n`;
                        if (tx.outputs[0].address === c.N2T_ADDRESS) {
                            const token = tx.outputs[0].assets.find(a => a.amount !== 1 && a.name && a.name.indexOf('_LP') === -1);
                            message += `+${tx.outputs[0].value * 1.0 / c.NANOERG} <b>ERG</b>\n`;
                            message += `+${(token.decimals > 0) ? token.amount * 1.0 / token.decimals : token.amount} <b>${token.name}</b>\n`;
                        }
                        if (tx.outputs[0].address === c.T2T_ADDRESS) {
                            const tokens = tx.outputs[0].assets.filter(a => a.amount !== 1 && a.name && a.name.indexOf('_LP') === -1);
                            message += `+${(tokens[0].decimals > 0) ? tokens[0].amount * 1.0 / tokens[0].decimals : tokens[0].amount} <b>${tokens[0].name}</b>\n`;
                            message += `+${(tokens[1].decimals > 0) ? tokens[1].amount * 1.0 / tokens[1].decimals : tokens[1].amount} <b>${tokens[1].name}</b>\n`;
                        }

                        // Send the message to the Telegram group
                        u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID);
                        u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, SECOND_TELEGRAM_GROUP_ID);
                    }

                    // log last height to file           
                    fs.writeFileSync(WORK_FILE_PATH, blockInfo.height.toString());

                    console.log('[%s] processed block %s (%s)', new Date().toISOString(), blockInfo.height.toString(), p.basename(__filename));

                    // sleep 1s between calls
                    await u.sleep(1000);
                }
                offset += BLOCKS_PER_CALL;
            }
            while (blockInfos.length === BLOCKS_PER_CALL)
        }
        catch(e) {
            console.trace('[%s] processing failed: %s (%s)', new Date().toISOString(), e, p.basename(__filename))
        }

        // wait
        await u.sleep(LOOP_ITNERVAL_MS);
    }
    while(true)
}

run();