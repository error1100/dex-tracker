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
    return Buffer.from(bytes).toString('hex');
    // return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}

async function getOrderDetails(orderBox) {
    let orderType, feeType, poolType;
    try {
        ergoTree = l.ErgoTree.from_base16_bytes(orderBox.ergoTree);
        ergoTreeTemplate = await toHexString(ergoTree.template_bytes());

        switch(ergoTreeTemplate) {
            case c.N2T_SWAP_SELL_TEMPLATE_ERG: //sell from pool perspective
                orderType = 'BUY ORDER'; //buy from user perspective
                poolType = 'N2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_SWAP_SELL_TEMPLATE_SPF: //sell from pool perspective
                orderType = 'BUY ORDER'; //buy from user perspective
                poolType = 'N2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(14).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_SWAP_BUY_TEMPLATE_ERG: //buy from pool perspective
                orderType = 'SELL ORDER' //sell from user perspective
                poolType = 'N2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_SWAP_BUY_TEMPLATE_SPF: //buy from pool perspective
                orderType = 'SELL ORDER' //sell from user perspective
                poolType = 'N2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(12).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.T2T_SWAP_TEMPLATE_ERG:
                orderType = 'TOKEN SWAP'
                poolType = 'T2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.T2T_SWAP_TEMPLATE_SPF:
                orderType = 'TOKEN SWAP'
                poolType = 'T2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(19).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_DEPOSIT_TEMPLATE_ERG:
                orderType = 'LIQUIDITY DEPOSIT'
                poolType = 'N2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_REDEEM_TEMPLATE_ERG:
                orderType = 'LIQUIDITY REDEEM'
                poolType = 'N2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_DEPOSIT_TEMPLATE_SPF:
                orderType = 'LIQUIDITY DEPOSIT'
                poolType = 'N2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(13).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.N2T_REDEEM_TEMPLATE_SPF:
                orderType = 'LIQUIDITY REDEEM'
                poolType = 'N2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(12).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.T2T_DEPOSIT_TEMPLATE_ERG:
                orderType = 'LIQUIDITY DEPOSIT'
                poolType = 'T2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.T2T_REDEEM_TEMPLATE_ERG:
                orderType = 'LIQUIDITY REDEEM'
                poolType = 'T2T';
                feeType = 'erg';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(0).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.T2T_DEPOSIT_TEMPLATE_SPF:
                orderType = 'LIQUIDITY DEPOSIT'
                poolType = 'T2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(14).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            case c.T2T_REDEEM_TEMPLATE_SPF:
                orderType = 'LIQUIDITY REDEEM'
                poolType = 'T2T';
                feeType = 'spf';
                redeemerAddress = l.Address.p2pk_from_pk_bytes(ergoTree.get_constant(14).sigma_serialize_bytes().subarray(2)).to_base58();
                break;
            default:
                orderType = 'CUSTOM'
                poolType = (orderBox.address === c.N2T_ADDRESS) ? 'N2T' : 'T2T';
                feeType = 'unknown'
                redeemerAddress = undefined;
                break;
        }

        if (ergoTree && ergoTree.ptr !== 0) ergoTree.free();
    }
    catch (e){
        console.log('[%s] failure deserializing ergoTree %s (%s)', new Date().toISOString(), e, p.basename(__filename));
        orderType = 'CUSTOM';
        poolType = (orderBox.address === c.N2T_ADDRESS) ? 'N2T' : 'T2T';
        feeType = 'unknown';
    }

    return { 'orderType': orderType, 'poolType':poolType, 'feeType': feeType, 'redeemerAddress': redeemerAddress, 'dex': 'ERGODEX' }
}

async function getOrderUIFeeDetails(orderBox, orderDetails) {
    let orderFeeAddress = '';
    let orderFeeAmount = 0;
    if (orderDetails.orderType !== 'CUSTOM' ) {
        const orderTx = (await a.get(`${c.EXPLORER_API_URL}api/v1/transactions/${orderBox.transactionId}`)).data;
        if (orderTx.outputs.length === 4) { 
            orderFeeAddress = orderTx.outputs[1].address;
            orderFeeAmount = orderTx.outputs[1].value;
        };
    }

    return { 'orderFeeAddress': orderFeeAddress, 'orderFeeAmount': orderFeeAmount }
}

async function sendMessageToGroup(message, botToken, chatId) {
    const sendMessageEndpoint = `https://api.telegram.org/bot${botToken}/sendMessage?parse_mode=HTML&disable_web_page_preview=true`;

    const params = new URLSearchParams({
        chat_id: chatId,
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
module.exports.getOrderUIFeeDetails = getOrderUIFeeDetails;
module.exports.sendMessageToGroup = sendMessageToGroup;