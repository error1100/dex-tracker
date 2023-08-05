// requires
const c = require('./constants.js');
const u = require('./utils.js');
const l = require('ergo-lib-wasm-nodejs');
const a = require('axios');
const ar = require('axios-retry');
const fs = require('fs');
const p = require('path');

// params
const LOOP_ITNERVAL_MS = (process.env && process.env.LOOP_ITNERVAL_MS) ? parseInt(process.env.LOOP_ITNERVAL_MS) : 180000;
const WORK_FILE_PATH = (process.env && process.env.WORK_FILE_PATH) ? parseInt(process.env.WORK_FILE_PATH) : '/tmp/lastBlockHeight';
const INIT_BLOCK_HEIGHT = (process.env && process.env.INIT_BLOCK_HEIGHT) ? parseInt(process.env.INIT_BLOCK_HEIGHT) : 1061730;
const BLOCKS_PER_CALL = (process.env && process.env.BLOCKS_PER_CALL) ? parseInt(process.env.BLOCKS_PER_CALL) : 50;
const TELEGRAM_BOT_TOKEN = (process.env && process.env.TELEGRAM_BOT_TOKEN) ? parseInt(process.env.TELEGRAM_BOT_TOKEN) : '';
const TELEGRAM_GROUP_ID = (process.env && process.env.TELEGRAM_GROUP_ID) ? parseInt(process.env.TELEGRAM_GROUP_ID) : '';

// run
async function run() {
    ar(a, { retries: 3 });
    const minerFeeAddress = await l.MinerAddress.mainnet_fee_address();
    do {
        // get last block height
        if (!fs.existsSync(WORK_FILE_PATH)) { fs.writeFileSync(WORK_FILE_PATH, INIT_BLOCK_HEIGHT); }
        let lastBlockHeight = parseInt(fs.readFileSync(WORK_FILE_PATH));
        let offset = lastBlockHeight;
        let blockInfos;

        do {
            // get blocks
            blockInfos = (await a.get(`${c.EXPLORER_API_URL}api/v1/blocks?limit=${BLOCKS_PER_CALL}&offset=${lastBlockHeight}&sortBy=height&sortDirection=asc`)).data.items;
            for (let blockInfo of blockInfos) {
                if (blockInfo.height <= lastBlockHeight) { 
    
                    break; 
                }
                const block = (await a.get(`${c.EXPLORER_API_URL}api/v1/blocks/${blockInfo.id}`)).data;
    
                // get spectrum txs
                const txs = block.block.blockTransactions.filter(t => t.outputs.filter(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS).length > 0);
                for (let tx of txs) {
    
                    // get input boxes and details
                    const prevPoolBox = (await a.get(`${c.EXPLORER_API_URL}api/v1/boxes/${tx.inputs[0].id}`)).data;
                    const orderBox = (await a.get(`${c.EXPLORER_API_URL}api/v1/boxes/${tx.inputs[1].id}`)).data;
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
    
                    // Construct the message
                    let message = `${orderDetails.poolType} ${orderDetails.orderType} TX ${
                        tx.id
                    } Block Height: ${blockInfo.height}\nUser: ${rewardBox.address}\n`;

                    // in logic
                    if (ergDiff < 0) {
                        message += `${ergDiff} ERG\n`;
                    }
                    for (let tokenOrder of orderBox.assets) {
                        let tokenDiff = tokenDiffs.find(
                            (t) => t.tokenId === tokenOrder.tokenId
                        );
                        if (tokenDiff && tokenDiff.amount < 0) {
                            message += `${tokenDiff.amount} ${tokenDiff.name}\n`;
                        }
                    }

                    // out logic
                    if (ergDiff > 0) {
                        message += `+${ergDiff} ERG\n`;
                    }
                    for (let tokenDiff of tokenDiffs) {
                        let tokenOrder = orderBox.assets.find(
                            (t) => t.tokenId === tokenDiff.tokenId
                        );
                        if (!tokenOrder && tokenDiff.amount > 0) {
                            message += `+${tokenDiff.amount} ${tokenDiff.name}\n`;
                        }
                    }
                    message += '\n';

                    // Send the message to the Telegram group
                    u.sendMessageToGroup(message,TELEGRAM_BOT_TOKEN,TELEGRAM_GROUP_ID);
                }                
                fs.writeFileSync(WORK_FILE_PATH, blockInfo.height.toString());
                // sleep 1s between calls
                await u.sleep(1000);
            }
            offset += BLOCKS_PER_CALL;
        }
        while (blockInfos.length === BLOCKS_PER_CALL)

        // wait
        await u.sleep(LOOP_ITNERVAL_MS);
    }
    while(true)
}

run();