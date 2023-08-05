const l = require('ergo-lib-wasm-nodejs');
const p = require('path');
const c = require('./constants.js');

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}

async function toHexString(bytes) {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}

async function getOrderDetails(orderBox) {
    let orderType, feeType, poolType;
    try {
        ergoTree = await l.ErgoTree.from_base16_bytes(orderBox.ergoTree);
        ergoTreeTemplate = await toHexString(ergoTree.template_bytes());

        switch(ergoTreeTemplate) {
            case c.N2T_SWAP_SELL_TEMPLATE_ERG: //sell from pool perspective
                orderType = 'swap buy'; //buy from user perspective
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_SWAP_SELL_TEMPLATE_SPF: //sell from pool perspective
                orderType = 'swap buy'; //buy from user perspective
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.N2T_SWAP_BUY_TEMPLATE_ERG: //buy from pool perspective
                orderType = 'swap sell' //sell from user perspective
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_SWAP_BUY_TEMPLATE_SPF: //buy from pool perspective
                orderType = 'swap sell' //sell from user perspective
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.T2T_SWAP_TEMPLATE_ERG:
                orderType = 'swap'
                poolType = 'T2T';
                feeType = 'erg';
                break;
            case c.T2T_SWAP_TEMPLATE_SPF:
                orderType = 'swap'
                poolType = 'T2T';
                feeType = 'spf';
                break;
            case c.N2T_DEPOSIT_TEMPLATE_ERG:
                orderType = 'deposit'
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_REDEEM_TEMPLATE_ERG:
                orderType = 'redeem'
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_DEPOSIT_TEMPLATE_SPF:
                orderType = 'deposit'
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.N2T_REDEEM_TEMPLATE_SPF:
                orderType = 'redeem'
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.T2T_DEPOSIT_TEMPLATE_ERG:
                orderType = 'deposit'
                poolType = 'T2T';
                feeType = 'erg';
                break;
            case c.T2T_REDEEM_TEMPLATE_ERG:
                orderType = 'redeem'
                poolType = 'T2T';
                feeType = 'erg';
                break;
            case c.T2T_DEPOSIT_TEMPLATE_SPF:
                orderType = 'deposit'
                poolType = 'T2T';
                feeType = 'spf';
                break;
            case c.T2T_REDEEM_TEMPLATE_SPF:
                orderType = 'redeem'
                poolType = 'T2T';
                feeType = 'spf';
                break;
            default:
                orderType = 'custom'
                poolType = (orderBox.address === c.N2T_ADDRESS) ? 'N2T' : 'T2T';
                feeType = 'unknown'
                break;
        }
    }
    catch (e){
        console.log('[%s] failure deserializing ergoTree %s (%s)', new Date().toISOString(), e, p.basename(__filename));
        orderType = 'custom';
        poolType = (orderBox.address === c.N2T_ADDRESS) ? 'N2T' : 'T2T';
        feeType = 'unknown';
    }

    return { 'orderType': orderType, 'poolType':poolType, 'feeType': feeType }
}

async function sendMessageToGroup(message, botToken, groupId) {
    const sendMessageEndpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const params = new URLSearchParams({
        chat_id: groupId,
        text: message,
    });

    try {
        const response = await a.post(sendMessageEndpoint, params);
        if (response.data && response.data.ok) {
            console.log('Message sent successfully!');
        } else {
            console.log('Failed to send the message.');
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

module.exports.sleep = sleep;
module.exports.getOrderDetails = getOrderDetails;
module.exports.sendMessageToGroup = sendMessageToGroup;