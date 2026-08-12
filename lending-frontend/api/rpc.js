// A private endpoint goes here. The public RPC throttles `eth_getLogs`, and the
// farm P&L needs log history to work out what a wallet actually deposited.
const RPC_URL =
  process.env.RPC_URL || process.env.ROBINHOOD_MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com';

// Read-only JSON-RPC methods the app actually needs. Anything else is rejected so
// this endpoint cannot be abused as a general-purpose (or write-capable) RPC relay.
const ALLOWED_METHODS = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_call', 'eth_getCode',
  'eth_getBalance', 'eth_getTransactionReceipt', 'eth_getTransactionByHash',
  'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_getLogs', 'eth_gasPrice',
  'eth_estimateGas', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isThrottle = (payload) => {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.some((item) => item?.error?.code === 429 || /too many requests|compute units/i.test(item?.error?.message || ''));
};
const methodsAllowed = (payload) => {
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0) return false;
  return items.every((item) => item && typeof item.method === 'string' && ALLOWED_METHODS.has(item.method));
};

async function postRpc(payload) {
  const upstream = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: upstream.status, contentType: upstream.headers.get('content-type') || 'application/json', text, json };
}

async function postWithRetry(payload) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await postRpc(payload);
    last = result;
    if (result.status !== 429 && !isThrottle(result.json)) return result;
    await sleep(250 * (attempt + 1));
  }
  return last;
}

// Cache the (immutable) chainId per warm lambda instance to cut upstream calls.
let chainIdCache = null;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, chain: 'robinhood-mainnet' });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!req.body || (Array.isArray(req.body) && req.body.length === 0)) {
    res.status(400).json({ error: 'empty_body' });
    return;
  }
  if (!methodsAllowed(req.body)) {
    res.status(403).json({ error: 'method_not_allowed', message: 'This RPC proxy only serves the read-only calls the app needs.' });
    return;
  }

  try {
    // Fast-path: serve cached chainId without hitting upstream.
    if (!Array.isArray(req.body) && req.body.method === 'eth_chainId' && chainIdCache) {
      res.status(200).json({ jsonrpc: '2.0', id: req.body.id ?? null, result: chainIdCache });
      return;
    }

    if (Array.isArray(req.body)) {
      const out = [];
      const chunkSize = 4;
      for (let i = 0; i < req.body.length; i += chunkSize) {
        const chunk = req.body.slice(i, i + chunkSize);
        const result = await postWithRetry(chunk);
        if (result.status >= 400 && !result.json) {
          res.status(result.status).setHeader('content-type', result.contentType).send(result.text);
          return;
        }
        const payload = Array.isArray(result.json) ? result.json : chunk.map((request) => ({ jsonrpc: '2.0', id: request.id ?? null, error: result.json?.error || { code: result.status, message: result.text || 'upstream rpc error' } }));
        out.push(...payload);
        if (i + chunkSize < req.body.length) await sleep(120);
      }
      res.status(200).json(out);
      return;
    }

    const result = await postWithRetry(req.body);
    if (req.body.method === 'eth_chainId' && result.json?.result) chainIdCache = result.json.result;
    res.status(result.status);
    res.setHeader('content-type', result.contentType);
    res.send(result.text);
  } catch (error) {
    res.status(502).json({ error: 'rpc_proxy_failed' });
  }
}
