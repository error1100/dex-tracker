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
const TELEGRAM_CHAT_ID = (process.env && process.env.TELEGRAM_GROUP_ID) ? process.env.TELEGRAM_GROUP_ID : '';
const UI_FEE_ADDRESSES = [
    { name: 'ERGODEX', address: '9fdmUutc4DhcqXAAyQeBTsw49PjEM4vuW9riQCHtXAoGEw3R11d' }
    ,{ name: 'CROOKS', address: '9gpSJSBCSmti2xDqjSgf51N4z5QpUePJrF3cS8jto62ufhDrxLm' }
]

const amountFormatOptions = {
    style: 'decimal'
};

// run
async function run() {
    ar(a, { retries: 6, retryDelay: 20000 });
    const minerFeeAddress = l.MinerAddress.mainnet_fee_address();
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
                    // let blockTime = (new Date(blockInfo.timestamp)).toISOString().replace('T',' ').replace('Z','');
        
                    // process spectrum existing pools txs
                    const txs = block.block.blockTransactions.filter(t => t.inputs.some(i => i.address === c.N2T_ADDRESS || i.address === c.T2T_ADDRESS) && t.outputs.some(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS));
                    for (let tx of txs) {
                        // get input boxes and details
                        const poolBoxIndex = tx.inputs.findIndex(i => i.address === c.N2T_ADDRESS || i.address === c.T2T_ADDRESS);
                        const orderBoxIndex = (poolBoxIndex === 0) ? 1 : 0;
                        const prevPoolBox = (await a.get(`${c.EXPLORER_API_URL}api/v1/boxes/${tx.inputs[poolBoxIndex].id}`)).data;
                        const orderBox = (await a.get(`${c.EXPLORER_API_URL}api/v1/boxes/${tx.inputs[orderBoxIndex].id}`)).data;
                        const orderDetails = await u.getOrderDetails(orderBox);
                        const orderUIFeeDetails = await u.getOrderUIFeeDetails(orderBox, orderDetails);
                        orderDetails.dex = (orderUIFeeDetails.orderFeeAddress && UI_FEE_ADDRESSES.find(a => a.address === orderUIFeeDetails.orderFeeAddress)) ? UI_FEE_ADDRESSES.find(a => a.address === orderUIFeeDetails.orderFeeAddress).name : 'ERGODEX';
        
                        const poolBox = tx.outputs.find(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS);
                        const minerBox = tx.outputs.find(o => o.address === minerFeeAddress);
                        const rewardBox = (tx.outputs.length === 3) ? tx.outputs.find(o => o.address !== c.N2T_ADDRESS && o.address !== c.T2T_ADDRESS && o.address !== minerFeeAddress) : tx.outputs.find(o => (o.address === orderDetails.redeemerAddress) || (o.address !== c.N2T_ADDRESS && o.address !== c.T2T_ADDRESS && o.address !== minerFeeAddress));
                        const operatorBox = (tx.outputs.length > 3) ? tx.outputs.find(o => o.address !== c.N2T_ADDRESS && o.address !== c.T2T_ADDRESS && o.address !== minerFeeAddress && o.address !== rewardBox.address) : undefined;
        
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
                        let message = `${(orderDetails.orderType === 'CUSTOM') ? '🤖' : '🤑' } | <i><a href="https://sigmaspace.io/en/transaction/${tx.id}">${rewardBox.address.substring(0,4)}</a></i> | ${orderDetails.dex} | ${blockInfo.height}\n`;

                        // in logic
                        if (ergDiff < 0) {
                            message += `${ergDiff.toLocaleString('en-us', amountFormatOptions)} ERG\n`;
                        }
                        for (let tokenOrder of orderBox.assets) {
                            let tokenDiff = tokenDiffs.find((t) => t.tokenId === tokenOrder.tokenId);
                            if (tokenDiff && tokenDiff.amount < 0) {
                                message += `${tokenDiff.amount.toLocaleString('en-us', amountFormatOptions)} ${tokenDiff.name}\n`;
                            }
                        }

                        // out logic
                        if (ergDiff > 0) {
                            message += `+${ergDiff.toLocaleString('en-us',amountFormatOptions)} ERG\n`;
                        }
                        for (let tokenDiff of tokenDiffs) {
                            let tokenOrder = orderBox.assets.find((t) => t.tokenId === tokenDiff.tokenId);
                            if (!tokenOrder && tokenDiff.amount > 0) {
                                message += `+${tokenDiff.amount.toLocaleString('en-us', amountFormatOptions)} ${tokenDiff.name}\n`;
                            }
                            // SPF buy when SPF fee exception
                            if (orderDetails.feeType === 'spf' && tokenDiff.name === 'SPF' && tokenDiff.amount > 0) {
                                message += `+${tokenDiff.amount.toLocaleString('en-us', amountFormatOptions)} ${tokenDiff.name}\n`;
                            }
                        }

                        // console.log('message:', message);

                        // Send the message to the Telegram group
                        u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
                    }

                    // process spectrum new pool txs
                    const newTxs = block.block.blockTransactions.filter(t => !t.inputs.some(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS) && t.outputs.some(o => o.address === c.N2T_ADDRESS || o.address === c.T2T_ADDRESS));
                    for (let tx of newTxs) {
                        let message = ` <b> LP CREATE</b>  <i><a href="https://sigmaspace.io/en/transaction/${tx.id}">${rewardBox.address.substring(0,4)}</a></i>\n`;
                        if (tx.outputs[0].address === c.N2T_ADDRESS) {
                            const token = tx.outputs[0].assets.find(a => a.amount !== 1 && a.name && a.name.indexOf('_LP') === -1);
                            message += `+${tx.outputs[0].value * 1.0 / c.NANOERG} <b>ERG</b>\n`;
                            message += `+${(token.decimals > 0) ? (token.amount * 1.0 / token.decimals).toLocaleString('en-us', amountFormatOptions) : token.amount.toLocaleString('en-us', amountFormatOptions)} <b>${token.name}</b>\n`;
                        }
                        if (tx.outputs[0].address === c.T2T_ADDRESS) {
                            const tokens = tx.outputs[0].assets.filter(a => a.amount !== 1 && a.name && a.name.indexOf('_LP') === -1);
                            message += `+${(tokens[0].decimals > 0) ? (tokens[0].amount * 1.0 / tokens[0].decimals).toLocaleString('en-us', amountFormatOptions) : tokens[0].amount.toLocaleString('en-us', amountFormatOptions)} <b>${tokens[0].name}</b>\n`;
                            message += `+${(tokens[1].decimals > 0) ? (tokens[1].amount * 1.0 / tokens[1].decimals).toLocaleString('en-us', amountFormatOptions) : tokens[1].amount.toLocaleString('en-us', amountFormatOptions)} <b>${tokens[1].name}</b>\n`;
                        }

                        // Send the message to the Telegram group
                        u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
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