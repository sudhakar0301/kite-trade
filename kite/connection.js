const { KiteConnect } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
//const { KITE_API_KEY, KITE_API_SECRET } = require("../config");
const kiteApiKey = 'r1a7qo9w30bxsfax';
const kiteApiSecret = 'dg9xa47tsayepnnb2xhdk0vk081cec36';

let kc = null;

function getAccessToken() {
  const tokenPath = path.join(__dirname, "../access_token.txt");
  return fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, "utf8").trim() : null;
}

async function initKiteConnect() {
  kc = new KiteConnect({ api_key: kiteApiKey });
  const accessToken = getAccessToken();

  if (!accessToken) throw new Error("⚠️ No access token found. Please login first.");

  kc.setAccessToken(accessToken);
  console.log("✅ KiteConnect initialized");

  return kc;
}

function getKiteConnect() {
  if (!kc) throw new Error("⚠️ KiteConnect not initialized");
  return kc;
}

module.exports = {
  initKiteConnect,
  getKiteConnect,
};
