// Một kết nối SignalR (ASP.NET SignalR 1.3) tới SSI FC Data v2 hub
// FcMarketDataV2Hub, đăng ký đúng MỘT channel (VD "X:SSI-HPG" hoặc "MI:VN30").
// Tách từ services/ssiMarketStream.js, bổ sung:
// - tự nối lại với backoff + jitter, không dừng cho tới khi stop();
// - watchdog: không nhận khung nào (kể cả keep-alive) trong 60s -> coi như
//   socket chết, đóng và nối lại (trước đây socket "treo" vẫn báo connected).

import WebSocket from "ws";
import { getMarketAccessToken } from "../../services/ssiFastConnect.js";

const HUB = "FcMarketDataV2Hub";

function streamBase() {
  const configured = process.env.SSI_DATA_STREAM_URL || "wss://fc-datahub.ssi.com.vn/v2.0";
  const url = new URL(configured);
  if (url.protocol !== "wss:" && url.protocol !== "https:") throw new Error("SSI_DATA_STREAM_URL must use secure WSS/HTTPS.");
  const path = url.pathname.replace(/\/+$/, "");
  return { wsOrigin: `wss://${url.host}`, httpOrigin: `https://${url.host}`, path };
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
  if (!response.ok) {
    const error = new Error(`SSI stream handshake failed (HTTP ${response.status}).`);
    error.statusCode = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : {};
}

/** Trích nội dung broadcast của hub; trả undefined cho khung keep-alive/handshake. */
export function parseSignalrFrame(raw) {
  try {
    const outer = JSON.parse(raw.toString());
    for (const invocation of outer.M || []) {
      if (String(invocation.H).toLowerCase() !== HUB.toLowerCase() || String(invocation.M).toLowerCase() !== "broadcast") continue;
      const content = typeof invocation.A?.[0] === "string" ? JSON.parse(invocation.A[0]) : invocation.A?.[0];
      if (typeof content?.Content === "string") {
        try { content.Content = JSON.parse(content.Content); } catch { /* giữ nguyên nội dung gốc */ }
      }
      return content;
    }
  } catch {
    // Không phải JSON hợp lệ: bỏ qua.
  }
  return undefined;
}

export class SignalRConnection {
  constructor({ channel, onMessage, onStatus, getToken = getMarketAccessToken, idleTimeoutMs = 60_000 }) {
    this.channel = channel;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.getToken = getToken;
    this.idleTimeoutMs = idleTimeoutMs;
    this.state = "idle";
    this.stopped = false;
    this.attempt = 0;
    this.invocationId = 0;
    this.sentChannel = "";
  }

  #setState(state, detail) {
    if (this.state === state) return;
    this.state = state;
    this.onStatus?.(state, detail);
  }

  start() {
    this.stopped = false;
    this.#connectLoop();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
    this.socket?.close();
    this.socket = undefined;
    this.#setState("stopped");
  }

  setChannel(channel) {
    this.channel = channel;
    this.#sendChannel();
  }

  #sendChannel() {
    if (this.state !== "connected" || this.socket?.readyState !== WebSocket.OPEN || !this.channel) return;
    if (this.channel === this.sentChannel) return;
    this.sentChannel = this.channel;
    this.socket.send(JSON.stringify({ H: HUB, M: "SwitchChannels", A: [this.channel], I: String(++this.invocationId) }));
  }

  #scheduleRetry(error) {
    if (this.stopped) return;
    this.#setState("down", error?.message);
    const base = Math.min(1_000 * 2 ** this.attempt, 30_000);
    this.attempt = Math.min(this.attempt + 1, 6);
    const jitter = Math.floor(Math.random() * 1_000);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.#connectLoop(), base + jitter);
  }

  async #connectLoop() {
    if (this.stopped) return;
    this.#setState("connecting");
    try {
      await this.#connectOnce();
    } catch (error) {
      this.#scheduleRetry(error);
    }
  }

  async #connectOnce() {
    const token = await this.getToken();
    const base = streamBase();
    const hubPath = signalrPath(base.path).replace(/^\/?/, "/");
    const connectionData = JSON.stringify([{ name: HUB }]);
    const negotiate = new URL(`${base.httpOrigin}${hubPath}/negotiate`);
    negotiate.search = new URLSearchParams({ connectionData, clientProtocol: "1.3" }).toString();
    const negotiated = await authorizedHubRequest(negotiate, token);
    if (!negotiated.ConnectionToken) throw new Error("SSI SignalR negotiate response is missing ConnectionToken.");

    const connect = new URL(`${base.wsOrigin}${hubPath}/connect`);
    connect.search = new URLSearchParams({
      clientProtocol: "1.3", transport: "webSockets", connectionToken: negotiated.ConnectionToken, connectionData, tid: "10",
    }).toString();

    await new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(connect, { headers: { authorization: `Bearer ${token}` }, handshakeTimeout: 10_000 });
      this.socket = socket;
      let lastFrameAt = Date.now();
      const connectTimeout = setTimeout(() => socket.terminate(), 15_000);

      socket.once("open", async () => {
        try {
          const start = new URL(`${base.httpOrigin}${hubPath}/start`);
          start.search = new URLSearchParams({ clientProtocol: "1.3", transport: "webSockets", connectionToken: negotiated.ConnectionToken, connectionData }).toString();
          const result = await authorizedHubRequest(start, token);
          if (result.Response && result.Response !== "started") throw new Error("SSI SignalR start handshake was not accepted.");
          clearTimeout(connectTimeout);
          if (this.stopped) {
            settled = true;
            socket.close();
            resolve();
            return;
          }
          this.attempt = 0;
          this.sentChannel = "";
          this.#setState("connected");
          this.#sendChannel();
          clearInterval(this.watchdog);
          this.watchdog = setInterval(() => {
            if (Date.now() - lastFrameAt > this.idleTimeoutMs) socket.terminate();
          }, 10_000);
          settled = true;
          resolve();
        } catch (error) {
          clearTimeout(connectTimeout);
          socket.close();
          if (!settled) { settled = true; reject(error); }
        }
      });
      socket.on("message", (raw) => {
        lastFrameAt = Date.now();
        const content = parseSignalrFrame(raw);
        if (content) this.onMessage?.(content);
      });
      socket.on("error", (error) => {
        clearTimeout(connectTimeout);
        if (!settled) { settled = true; reject(error); }
      });
      socket.on("close", () => {
        clearTimeout(connectTimeout);
        clearInterval(this.watchdog);
        if (this.socket === socket) this.socket = undefined;
        this.sentChannel = "";
        if (!settled) { settled = true; reject(new Error("SSI market stream disconnected during connect.")); return; }
        this.#scheduleRetry(new Error("SSI market stream closed."));
      });
    });
  }
}
