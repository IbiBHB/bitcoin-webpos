var bitcoind = require('bitcoin'),
  prices = require('./prices'),
  levelup = require('levelup'),
  db = levelup('./db'),
  qrcode = require('yaqrcode'),
  bitcoinjs = require('bitcoinjs-lib');

var bitcoin = module.exports;
var localConfig;

function isAddress(string) {
  try {
    bitcoinjs.Address.fromBase58Check(string)
  } catch (e) {
    return false
  }
  return true
}


bitcoin.init = function (config, cb) {
  localConfig = config;
  bitcoin.client = new bitcoind.Client({
    host: config.host,
    port: config.port,
    user: config.username,
    pass: config.password,
    timeout: 5000
  });
  bitcoin.client.getBalance('*', 6, function (err) {
    if (err) return cb(err);
    return cb();
  });
};

bitcoin.getTotalBalance = function (cb) {
  bitcoin.client.getBalance('*', 6, function (err, result) {
    if (err) return cb(err);
    return cb(null, result);
  })
};

bitcoin.generatePaymentRequest = function (amount, currency, cb) {
  bitcoin.client.getNewAddress('bitcoin-webpos', function (err, address) {
    if (err) return cb(err);
    prices.bitcoinaverage(amount, currency, function (err, total) {
      if (err) return cb(err);
      var dbjson = {
        timestamp: new Date(),
        address: address,
        currency: currency,
        amount: amount,
        total: total,
        link: "bitcoin:" + address + "?amount=" + total,
        qr_base64: qrcode("bitcoin:" + address + "?amount=" + total)
      };
      db.put(address, JSON.stringify(dbjson), function (err) {
        if (err) return cb(err);
        return cb(null, dbjson);
      });
    });
  })
};

bitcoin.verifyPayment = function (address, cb) {
  db.get(address, function (err, value) {
    if (err) return cb(err);
    var jsonvalue = JSON.parse(value);
    bitcoin.client.getReceivedByAddress(address, 0, function (err, result) {
      if (err) return cb(err);
      if (parseFloat(result) === parseFloat(jsonvalue.total)) {
        jsonvalue.verified_at = new Date();
        db.put(address, JSON.stringify(jsonvalue), function (err) {
          if (err) return cb(err);
          return cb(null, {verified: true});
        });
      }
      else
        return cb(null, {verified: false});
    });
  });
};

bitcoin.securePayment = function (address, cb) {
  db.get(address, function (err, value) {
    if (err) return cb(err);
    var jsonvalue = JSON.parse(value);
    if (localConfig.coldwallet && isAddress(localConfig.coldwallet)) {
      var sendamount = jsonvalue.total - 0.0001;
      bitcoin.client.sendFrom('bitcoin-webpos', localConfig.coldwallet, sendamount, 0, function (err, result) {
        if (err) return cb(err);
        jsonvalue.secured_at = new Date();
        db.put(address, JSON.stringify(jsonvalue), function (err) {
          if (err) return cb(err);
          return cb(null, {txid: result});
        });
      });
    }
    else
      return cb('Cold wallet address is invalid');
  });
};

bitcoin.getPaymentDetails = function (address, cb) {
  db.get(address, function (err, value) {
    console.log(value);
    if (err) return cb(err);
    var jsonvalue = JSON.parse(value);
    return cb(null, jsonvalue);
  });
};