import robotsParser from 'robots-parser';
import { fetch, ProxyAgent } from 'undici';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function requestText(url, { attempts = 3, timeoutMs = 30000, fetchImpl = fetch, sleep = wait, delayMs = 1000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { dispatcher, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'JUDGE90/1.0 (public football data; low-rate read-only)' } });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${new URL(url).hostname}`);
        error.permanent = response.status < 500 && ![408, 429].includes(response.status);
        const retry = response.headers?.get('retry-after');
        error.retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
        if (error.retryMs > 60000) error.permanent = true; // Do not retry earlier than requested.
        throw error;
      }
      return await response.text();
    } catch (error) {
      if (error.permanent || attempt === attempts) throw error;
      await sleep(Math.max(error.retryMs || 0, delayMs * 2 ** (attempt - 1)));
    }
  }
  throw new Error('Invalid HTTP attempt count');
}
export async function fetchJSON(url, options) { return JSON.parse(await fetchText(url, options)); }

const robotsCache = new Map();
const lastRequest = new Map();
export async function fetchText(url, options = {}) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  if (!robotsCache.has(origin)) {
    const robotsURL = origin + '/robots.txt';
    let body;
    try { body = await requestText(robotsURL, options); }
    catch (error) { if (/HTTP 404:/.test(error.message)) body = ''; else throw error; }
    robotsCache.set(origin, robotsParser(robotsURL, body));
    lastRequest.set(origin, Date.now());
  }
  const robots = robotsCache.get(origin);
  if (robots.isAllowed(String(url), 'JUDGE90') === false) throw new Error(`robots.txt disallows ${parsed.pathname}`);
  const delay = Math.max(250, (robots.getCrawlDelay('JUDGE90') || 0) * 1000);
  if (delay > 60000) throw new Error('robots.txt crawl delay exceeds this job limit');
  const remaining = delay - (Date.now() - (lastRequest.get(origin) || 0));
  if (remaining > 0) await (options.sleep || wait)(remaining);
  lastRequest.set(origin, Date.now());
  return requestText(url, options);
}
export { requestText }; // Dependency-injected retry tests, without live traffic.
