const l = require('ergo-lib-wasm-nodejs');
const p = require('path');
const c = require('./constants.js');
const a = require('axios');

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
                orderType = '🟢 || NEW BUY ORDER |'; //buy from user perspective
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_SWAP_SELL_TEMPLATE_SPF: //sell from pool perspective
                orderType = '🟢 || NEW BUY ORDER |'; //buy from user perspective
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.N2T_SWAP_BUY_TEMPLATE_ERG: //buy from pool perspective
                orderType = '🔴 || NEW SELL ORDER |' //sell from user perspective
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_SWAP_BUY_TEMPLATE_SPF: //buy from pool perspective
                orderType = '🔴 || NEW SELL ORDER |' //sell from user perspective
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.T2T_SWAP_TEMPLATE_ERG:
                orderType = 'Token Swap'
                poolType = 'T2T';
                feeType = 'erg';
                break;
            case c.T2T_SWAP_TEMPLATE_SPF:
                orderType = 'Token Swap'
                poolType = 'T2T';
                feeType = 'spf';
                break;
            case c.N2T_DEPOSIT_TEMPLATE_ERG:
                orderType = '🟢 || 📥 LIQUIDITY DEPOSIT |'
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_REDEEM_TEMPLATE_ERG:
                orderType = '🔴 || 📤 LIQUIDITY REDEEM |'
                poolType = 'N2T';
                feeType = 'erg';
                break;
            case c.N2T_DEPOSIT_TEMPLATE_SPF:
                orderType = '🟢 || 📥 LIQUIDITY DEPOSIT |'
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.N2T_REDEEM_TEMPLATE_SPF:
                orderType = '🔴 || 📤 LIQUIDITY REDEEM |'
                poolType = 'N2T';
                feeType = 'spf';
                break;
            case c.T2T_DEPOSIT_TEMPLATE_ERG:
                orderType = '🟢 || 📥 LIQUIDITY DEPOSIT | '
                poolType = 'T2T';
                feeType = 'erg';
                break;
            case c.T2T_REDEEM_TEMPLATE_ERG:
                orderType = '🔴 || 📤 LIQUIDITY REDEEM |'
                poolType = 'T2T';
                feeType = 'erg';
                break;
            case c.T2T_DEPOSIT_TEMPLATE_SPF:
                orderType = '🟢 || 📥 LIQUIDITY DEPOSIT |'
                poolType = 'T2T';
                feeType = 'spf';
                break;
            case c.T2T_REDEEM_TEMPLATE_SPF:
                orderType = '🔴 || 📤 LIQUIDITY REDEEM |'
                poolType = 'T2T';
                feeType = 'spf';
                break;
            default:
                orderType = '🤖 || CUSTOM BOT ?'
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
    const sendMessageEndpoint = `https://api.telegram.org/bot${botToken}/sendMessage?parse_mode=HTML&disable_web_page_preview=true`;

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