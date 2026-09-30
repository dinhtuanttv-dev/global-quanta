import WebSocket from "ws";
import { getMarketAccessToken } from "./ssiFastConnect.js";

const HUB = "FcMarketDataV2Hub";
const subscribers = new Map();
let started = false;
let starting;
let connected = false;
let socket;
let reconnectTimer;
let reconnectAttempt = 0;
let selectedChannel = "";
let invocationId = 0;

function streamBase() {
  const configured = process.env.SSI_DATA_STREAM_URL || "wss://fc-datahub.ssi.com.vn/v2.0";
  const url = new URL(configured);
  if (url.protocol !== "wss:" && url.protocol !== "https:") throw new Error("SSI_DATA_STREAM_URL must use secure WSS/HTTPS.");
  const path = url.pathname.replace(/\/+$/, "");
  const wsProtocol = url.protocol === "https:" ? "wss:" : url.protocol;
  return { wsOrigin: `${wsProtocol}//${url.host}`, httpOrigin: `https://${url.host}`, path };
}

function signalrPath(path) {
  if (path.endsWith("/v2.0/signalr")) return path;
  if (path.endsWith("/v2.0")) return `${path}/signalr`;
  return `${path}/v2.0/signalr`;
}

async function authorizedHubRequest(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SSI stream handshake failed (HTTP ${response.status}).`);
  return text ? JSON.parse(text) : {};
}

function writeStatus(connectedNow) {
  const event = `event: status\ndata: ${JSON.stringify({ connected: connectedNow })}\n\n`;
  for (const response of subscribers.keys()) response.write(event);
}

function aggregateSymbols() {
  return [...new Set([...subscribers.values()].flatMap((set) => [...set]))].sort();
}

function switchChannel() {
  if (!connected || !socket || socket.readyState !== WebSocket.OPEN) return;
  const symbols = aggregateSymbols();
  if (!symbols.length) return;
  // X gives both last trade and bid/ask snapshot in one stream channel.
  const channel = `X:${symbols.join("-")}`;
  if (channel === selectedChannel) return;
  selectedChannel = channel;
  socket.send(JSON.stringify({ H: HUB, M: "SwitchChannels", A: [channel], I: String(++invocationId) }));
}

function parseMessage(raw) {
  try {
    const outer = JSON.parse(raw.toString());
    for (const invocation of outer.M || []) {
      if (String(invocation.H).toLowerCase() !== HUB || String(invocation.M).toLowerCase() !== "broadcast") continue;
      const content = typeof invocation.A?.[0] === "string" ? JSON.parse(invocation.A[0]) : invocation.A?.[0];
      if (typeof content?.Content === "string") {
        try { content.Content = JSON.parse(content.Content); } catch { /* retain SSI's raw content */ }
      }
      return content;
    }
  } catch {
    // SignalR keepalive and handshake frames are not market ticks.
  }
  return undefined;
}

function relay(raw) {
  const event = parseMessage(raw);
  if (!event) return;
  const symbol = String(event?.Content?.Symbol || event?.Content?.IndexId || event?.Symbol || "").toUpperCase();
  const serialized = `event: quote\ndata: ${JSON.stringify(event)}\n\n`;
  for (const [response, symbols] of subscribers) {
    if (!symbol || symbols.has(symbol)) response.write(serialized);
  }
}

function scheduleReconnect() {
  if (!started || subscribers.size === 0 || reconnectTimer) return;
  const waitMs = Math.min(1_000 * (2 ** reconnectAttempt), 30_000);
  reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectUpstream().catch(() => scheduleReconnect());
  }, waitMs);
}

async function connectUpstream() {
  if (!started || subscribers.size === 0) return;
  const token = await getMarketAccessToken();
  if (!started || subscribers.size === 0) return;
  const base = streamBase();
  const hubPath = signalrPath(base.path).replace(/^\/?/, "/");
  const connectionData = JSON.stringify([{ name: HUB }]);
  const negotiate = new URL(`${base.httpOrigin}${hubPath}/negotiate`);
  negotiate.search = new URLSearchParams({ connectionData, clientProtocol: "1.3" }).toString();
  const negotiated = await authorizedHubRequest(negotiate, token);
  if (!negotiated.ConnectionToken) throw new Error("SSI SignalR negotiate response is missing ConnectionToken.");

  const connect = new URL(`${base.wsOrigin}${hubPath}/connect`);
  connect.search = new URLSearchParams({
    clientProtocol: "1.3", transport: "webSockets", connectionToken: negotiated.ConnectionToken,
    connectionData, tid: "10",
  }).toString();

  await new Promise((resolve, reject) => {
    let settled = false;
    const current = new WebSocket(connect, { headers: { authorization: `Bearer ${token}` }, handshakeTimeout: 10_000 });
    socket = current;
    const connectionTimeout = setTimeout(() => current.terminate(), 15_000);
    current.once("open", async () => {
      try {
        const start = new URL(`${base.httpOrigin}${hubPath}/start`);
        start.search = new URLSearchParams({ clientProtocol: "1.3", transport: "webSockets", connectionToken: negotiated.ConnectionToken, connectionData }).toString();
        const result = await authorizedHubRequest(start, token);
        if (result.Response && result.Response !== "started") throw new Error("SSI SignalR start handshake was not accepted.");
        connected = true;
        selectedChannel = "";
        reconnectAttempt = 0;
        clearTimeout(connectionTimeout);
        switchChannel();
        writeStatus(true);
        settled = true;
        resolve();
      } catch (error) {
        clearTimeout(connectionTimeout);
        current.close();
        if (!settled) { settled = true; reject(error); }
      }
    });
    current.on("message", relay);
    current.on("error", (error) => {
      clearTimeout(connectionTimeout);
      connected = false;
      writeStatus(false);
      if (!settled) { settled = true; reject(error); }
    });
    current.on("close", () => {
      clearTimeout(connectionTimeout);
      if (socket === current) socket = undefined;
      connected = false;
      selectedChannel = "";
      writeStatus(false);
      if (!settled) { settled = true; reject(new Error("SSI market stream disconnected during connect.")); }
      else scheduleReconnect();
    });
  });
}

async function startUpstream() {
  if (started) return;
  if (starting) return starting;
  starting = (async () => {
    await getMarketAccessToken(); // fail early if credentials/token are unavailable
    if (subscribers.size === 0) return;
    started = true;
    connectUpstream().catch(() => scheduleReconnect());
  })().finally(() => { starting = undefined; });
  return starting;
}

export async function subscribeMarketStream(response, requestedSymbols) {
  if (response.destroyed || response.writableEnded) return;
  const symbols = [...new Set(requestedSymbols.map((symbol) => symbol.toUpperCase()))];
  if (!symbols.length || symbols.length > 50 || symbols.some((symbol) => !/^[A-Z0-9.]{1,20}$/.test(symbol))) {
    const error = new Error("symbols cần gồm 1–50 mã hợp lệ, phân tách bằng dấu phẩy.");
    error.statusCode = 400;
    throw error;
  }
  const union = new Set([...aggregateSymbols(), ...symbols]);
  if (union.size > 200) {
    const error = new Error("Stream đang có quá nhiều mã đăng ký đồng thời.");
    error.statusCode = 429;
    throw error;
  }

  subscribers.set(response, new Set(symbols));
  try {
    // Register before opening the upstream socket: connectUpstream checks that
    // there is at least one subscriber and otherwise exits without connecting.
    await startUpstream();
    // The SSE client may disconnect while token acquisition is in flight.
    if (response.destroyed || response.writableEnded) {
      unsubscribeMarketStream(response);
      return;
    }
  } catch (error) {
    subscribers.delete(response);
    throw error;
  }
  response.write(`event: status\ndata: ${JSON.stringify({ connected })}\n\n`);
  switchChannel();
}

export function unsubscribeMarketStream(response) {
  subscribers.delete(response);
  if (subscribers.size === 0) {
    started = false;
    connected = false;
    selectedChannel = "";
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    socket?.close();
    socket = undefined;
    return;
  }
  switchChannel();
}
