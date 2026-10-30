// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: quant-macro-scanner lib/jobs (commit 4e68987). Tạo lại: node scripts/bundle-gateway-jobs.mjs <ra>
import { createRequire as __qmsCreateRequire } from "node:module"; const require = __qmsCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// stub:no-prisma
var require_no_prisma = __commonJS({
  "stub:no-prisma"() {
    "use strict";
    throw new Error("Prisma/Neon kh\xF4ng c\xF3 tr\xEAn Market Gateway");
  }
});

// lib/jobs/job-result.ts
var jobOk = (body) => ({ status: 200, body });
var jobFail = (body, status = 500) => ({ status, body });

// lib/market-data/ssi-gateway-adapter.ts
var MARKET_GATEWAY_URL = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
async function fetchSsiNominalHistory(ticker, years = 5, { timeoutMs = 45e3, fetchImpl = fetch } = {}) {
  const url = `${MARKET_GATEWAY_URL}/api/market/ohlcv/nominal-history?ticker=${encodeURIComponent(ticker)}&years=${years}`;
  try {
    const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { success: false, data: null, referenceAdjustments: [], error: `Gateway HTTP ${res.status}: ${body?.error ?? "kh\xF4ng r\xF5"}` };
    const data = (Array.isArray(body?.bars) ? body.bars : []).filter((b) => typeof b?.date === "string" && typeof b?.close === "number" && b.close > 0).map((b) => ({ date: b.date, close: b.close, ref: b.ref ?? null, volume: b.volume ?? null }));
    const referenceAdjustments = (Array.isArray(body?.referenceAdjustments) ? body.referenceAdjustments : []).filter((e) => typeof e?.date === "string" && typeof e?.factor === "number").map((e) => ({ date: e.date, factor: e.factor }));
    return {
      success: data.length > 0,
      data,
      referenceAdjustments,
      source: body?.provenance?.source ?? null,
      refresh: body?.provenance?.refresh ?? null,
      error: data.length ? void 0 : "Gateway tr\u1EA3 chu\u1ED7i r\u1ED7ng"
    };
  } catch (e) {
    return { success: false, data: null, referenceAdjustments: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// lib/cotuc/store/gateway-store.ts
var CotucStoreError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "CotucStoreError";
  }
};
var TIMEOUT_MS = 2e4;
var storeBase = () => (process.env.COTUC_STORE_URL || MARKET_GATEWAY_URL).replace(/\/+$/, "");
var MAX_BATCH_BYTES = 4e6;
function headers() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new CotucStoreError("Thi\u1EBFu CRON_SECRET \u0111\u1EC3 truy c\u1EADp kho C\u1ED5 t\u1EE9c tr\xEAn Gateway.", null);
  return { authorization: `Bearer ${secret}`, accept: "application/json" };
}
async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${storeBase()}/api/cotuc-store${path}`, { ...init, headers: { ...headers(), ...init.headers ?? {} }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new CotucStoreError(`Kho C\u1ED5 t\u1EE9c (Gateway) kh\xF4ng ph\u1EA3n h\u1ED3i: ${e instanceof Error ? e.message : String(e)}`, null);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new CotucStoreError(`Kho C\u1ED5 t\u1EE9c (Gateway) ${res.status}: ${body?.error ?? "ph\u1EA3n h\u1ED3i r\u1ED7ng"}`, res.status);
  return body;
}
async function storeList(table, opts = {}) {
  const q = new URLSearchParams();
  if (opts.tickers) {
    if (!opts.tickers.length) return [];
    q.set("tickers", opts.tickers.join(","));
  }
  if (opts.keys) {
    if (!opts.keys.length) return [];
    q.set("keys", opts.keys.join(","));
  }
  if (opts.fields?.length) q.set("fields", opts.fields.join(","));
  const qs = q.toString();
  const body = await call(`/${table}${qs ? `?${qs}` : ""}`);
  return body.rows;
}
async function storeUpsert(table, rows) {
  let written = 0;
  let batch = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const r = await call(`/${table}`, { method: "POST", headers: { "content-type": "application/json" }, body: `{"rows":[${batch.join(",")}]}` });
    written += r.written;
    batch = [];
    bytes = 0;
  };
  for (const row of rows) {
    const s = JSON.stringify(row);
    if (bytes + s.length > MAX_BATCH_BYTES) await flush();
    batch.push(s);
    bytes += s.length;
  }
  await flush();
  return written;
}
var asDate = (v) => v == null ? null : v instanceof Date ? v : new Date(String(v));
function withDates(row, cols) {
  const out = { ...row };
  for (const c of cols) if (c in out) out[c] = asDate(out[c]);
  return out;
}

// ../quant-macro-scanner/node_modules/uncrypto/dist/crypto.node.mjs
import nodeCrypto from "node:crypto";
var subtle = nodeCrypto.webcrypto?.subtle || {};

// ../quant-macro-scanner/node_modules/@upstash/redis/chunk-2X4SLXT7.mjs
var __defProp2 = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
var error_exports = {};
__export(error_exports, {
  UpstashError: () => UpstashError,
  UpstashJSONParseError: () => UpstashJSONParseError,
  UrlError: () => UrlError
});
var UpstashError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UpstashError";
  }
};
var UrlError = class extends Error {
  constructor(url) {
    super(
      `Upstash Redis client was passed an invalid URL. You should pass a URL starting with https. Received: "${url}". `
    );
    this.name = "UrlError";
  }
};
var UpstashJSONParseError = class extends UpstashError {
  constructor(body, options) {
    const truncatedBody = body.length > 200 ? body.slice(0, 200) + "..." : body;
    super(`Unable to parse response body: ${truncatedBody}`, options);
    this.name = "UpstashJSONParseError";
  }
};
function parseRecursive(obj) {
  const parsed = Array.isArray(obj) ? obj.map((o) => {
    try {
      return parseRecursive(o);
    } catch {
      return o;
    }
  }) : JSON.parse(obj);
  if (typeof parsed === "number" && parsed.toString() !== obj) {
    return obj;
  }
  return parsed;
}
function parseResponse(result) {
  try {
    return parseRecursive(result);
  } catch {
    return result;
  }
}
function deserializeScanResponse(result) {
  return [result[0], ...parseResponse(result.slice(1))];
}
function deserializeScanWithTypesResponse(result) {
  const [cursor, keys] = result;
  const parsedKeys = [];
  for (let i = 0; i < keys.length; i += 2) {
    parsedKeys.push({ key: keys[i], type: keys[i + 1] });
  }
  return [cursor, parsedKeys];
}
function mergeHeaders(...headers2) {
  const merged = {};
  for (const header of headers2) {
    if (!header) continue;
    for (const [key, value] of Object.entries(header)) {
      if (value !== void 0 && value !== null) {
        merged[key] = value;
      }
    }
  }
  return merged;
}
function kvArrayToObject(v) {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) return v;
  if (!Array.isArray(v)) return {};
  const obj = {};
  for (let i = 0; i < v.length; i += 2) {
    if (typeof v[i] === "string") obj[v[i]] = v[i + 1];
  }
  return obj;
}
var MAX_BUFFER_SIZE = 1024 * 1024;
var HttpClient = class {
  baseUrl;
  headers;
  options;
  readYourWrites;
  upstashSyncToken = "";
  hasCredentials;
  retry;
  constructor(config) {
    this.options = {
      backend: config.options?.backend,
      agent: config.agent,
      responseEncoding: config.responseEncoding ?? "base64",
      // default to base64
      cache: config.cache,
      signal: config.signal,
      keepAlive: config.keepAlive ?? true
    };
    this.upstashSyncToken = "";
    this.readYourWrites = config.readYourWrites ?? true;
    this.baseUrl = (config.baseUrl || "").replace(/\/$/, "");
    const urlRegex = /^https?:\/\/[^\s#$./?].\S*$/;
    if (this.baseUrl && !urlRegex.test(this.baseUrl)) {
      throw new UrlError(this.baseUrl);
    }
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers
    };
    this.hasCredentials = Boolean(this.baseUrl && this.headers.authorization.split(" ")[1]);
    if (this.options.responseEncoding === "base64") {
      this.headers["Upstash-Encoding"] = "base64";
    }
    this.retry = typeof config.retry === "boolean" && !config.retry ? {
      attempts: 1,
      backoff: () => 0
    } : {
      attempts: config.retry?.retries ?? 5,
      backoff: config.retry?.backoff ?? ((retryCount) => Math.exp(retryCount) * 50)
    };
  }
  mergeTelemetry(telemetry) {
    this.headers = merge(this.headers, "Upstash-Telemetry-Runtime", telemetry.runtime);
    this.headers = merge(this.headers, "Upstash-Telemetry-Platform", telemetry.platform);
    this.headers = merge(this.headers, "Upstash-Telemetry-Sdk", telemetry.sdk);
  }
  async request(req) {
    const requestHeaders = mergeHeaders(this.headers, req.headers ?? {});
    const requestUrl = [this.baseUrl, ...req.path ?? []].join("/");
    const isEventStream = requestHeaders.Accept === "text/event-stream";
    const signal = req.signal ?? this.options.signal;
    const isSignalFunction = typeof signal === "function";
    const requestOptions = {
      cache: this.options.cache,
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(req.body),
      keepalive: this.options.keepAlive,
      agent: this.options.agent,
      signal: isSignalFunction ? signal() : signal,
      /**
       * Fastly specific
       */
      backend: this.options.backend
    };
    if (!this.hasCredentials) {
      console.warn(
        "[Upstash Redis] Redis client was initialized without url or token. Failed to execute command."
      );
    }
    if (this.readYourWrites) {
      const newHeader = this.upstashSyncToken;
      this.headers["upstash-sync-token"] = newHeader;
    }
    let res = null;
    let error = null;
    for (let i = 0; i <= this.retry.attempts; i++) {
      try {
        res = await fetch(requestUrl, requestOptions);
        break;
      } catch (error_) {
        if (requestOptions.signal?.aborted && isSignalFunction) {
          throw error_;
        } else if (requestOptions.signal?.aborted) {
          const myBlob = new Blob([
            JSON.stringify({ result: requestOptions.signal.reason ?? "Aborted" })
          ]);
          const myOptions = {
            status: 200,
            statusText: requestOptions.signal.reason ?? "Aborted"
          };
          res = new Response(myBlob, myOptions);
          break;
        }
        error = error_;
        if (i < this.retry.attempts) {
          await new Promise((r) => setTimeout(r, this.retry.backoff(i)));
        }
      }
    }
    if (!res) {
      throw error ?? new Error("Exhausted all retries");
    }
    if (!res.ok) {
      let body2;
      const rawBody2 = await res.text();
      try {
        body2 = JSON.parse(rawBody2);
      } catch (error2) {
        throw new UpstashJSONParseError(rawBody2, { cause: error2 });
      }
      throw new UpstashError(`${body2.error}, command was: ${JSON.stringify(req.body)}`);
    }
    if (this.readYourWrites) {
      const headers2 = res.headers;
      this.upstashSyncToken = headers2.get("upstash-sync-token") ?? "";
    }
    if (isEventStream && req && req.onMessage && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      (async () => {
        try {
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            if (buffer.length > MAX_BUFFER_SIZE) {
              throw new Error("Buffer size exceeded (1MB)");
            }
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                req.onMessage?.(data);
              }
            }
          }
        } catch (error2) {
          if (error2 instanceof Error && error2.name === "AbortError") {
          } else {
            console.error("Stream reading error:", error2);
          }
        } finally {
          try {
            await reader.cancel();
          } catch {
          }
        }
      })();
      return { result: 1 };
    }
    let body;
    const rawBody = await res.text();
    try {
      body = JSON.parse(rawBody);
    } catch (error2) {
      throw new UpstashJSONParseError(rawBody, { cause: error2 });
    }
    if (this.readYourWrites) {
      const headers2 = res.headers;
      this.upstashSyncToken = headers2.get("upstash-sync-token") ?? "";
    }
    if (this.options.responseEncoding === "base64") {
      if (Array.isArray(body)) {
        return body.map(({ result: result2, error: error2 }) => ({
          result: decode(result2),
          error: error2
        }));
      }
      const result = decode(body.result);
      return { result, error: body.error };
    }
    return body;
  }
};
function base64decode(b64) {
  let dec = "";
  try {
    const binString = atob(b64);
    const size = binString.length;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    dec = new TextDecoder().decode(bytes);
  } catch {
    dec = b64;
  }
  return dec;
}
function decode(raw) {
  let result = void 0;
  switch (typeof raw) {
    case "undefined": {
      return raw;
    }
    case "number": {
      result = raw;
      break;
    }
    case "object": {
      if (Array.isArray(raw)) {
        result = raw.map(
          (v) => typeof v === "string" ? base64decode(v) : Array.isArray(v) ? v.map((element) => decode(element)) : v
        );
      } else {
        result = null;
      }
      break;
    }
    case "string": {
      result = raw === "OK" ? "OK" : base64decode(raw);
      break;
    }
    default: {
      break;
    }
  }
  return result;
}
function merge(obj, key, value) {
  if (!value) {
    return obj;
  }
  obj[key] = obj[key] ? [obj[key], value].join(",") : value;
  return obj;
}
var defaultSerializer = (c) => {
  switch (typeof c) {
    case "string":
    case "number":
    case "boolean": {
      return c;
    }
    default: {
      return JSON.stringify(c);
    }
  }
};
var Command = class {
  command;
  serialize;
  deserialize;
  headers;
  path;
  onMessage;
  isStreaming;
  signal;
  /**
   * Create a new command instance.
   *
   * You can define a custom `deserialize` function. By default we try to deserialize as json.
   */
  constructor(command, opts) {
    this.serialize = defaultSerializer;
    this.deserialize = opts?.automaticDeserialization === void 0 || opts.automaticDeserialization ? opts?.deserialize ?? parseResponse : (x) => x;
    this.command = command.map((c) => this.serialize(c));
    this.headers = opts?.headers;
    this.path = opts?.path;
    this.onMessage = opts?.streamOptions?.onMessage;
    this.isStreaming = opts?.streamOptions?.isStreaming ?? false;
    this.signal = opts?.streamOptions?.signal;
    if (opts?.latencyLogging) {
      const originalExec = this.exec.bind(this);
      this.exec = async (client2) => {
        const start = performance.now();
        const result = await originalExec(client2);
        const end = performance.now();
        const loggerResult = (end - start).toFixed(2);
        console.log(
          `Latency for \x1B[38;2;19;185;39m${this.command[0].toString().toUpperCase()}\x1B[0m: \x1B[38;2;0;255;255m${loggerResult} ms\x1B[0m`
        );
        return result;
      };
    }
  }
  /**
   * Execute the command using a client.
   */
  async exec(client2) {
    const { result, error } = await client2.request({
      body: this.command,
      path: this.path,
      upstashSyncToken: client2.upstashSyncToken,
      headers: this.headers,
      onMessage: this.onMessage,
      isStreaming: this.isStreaming,
      signal: this.signal
    });
    if (error) {
      throw new UpstashError(error);
    }
    if (result === void 0) {
      throw new TypeError("Request did not return a result");
    }
    return this.deserialize(result);
  }
};
var ExecCommand = class extends Command {
  constructor(cmd, opts) {
    const normalizedCmd = cmd.map((arg) => typeof arg === "string" ? arg : String(arg));
    super(normalizedCmd, opts);
  }
};
var FIELD_TYPES = [
  "TEXT",
  "U64",
  "I64",
  "F64",
  "BOOL",
  "DATE",
  "KEYWORD",
  "FACET"
];
function isFieldType(value) {
  return typeof value === "string" && FIELD_TYPES.includes(value);
}
function isDetailedField(value) {
  return typeof value === "object" && value !== null && "type" in value && isFieldType(value.type);
}
function isNestedSchema(value) {
  return typeof value === "object" && value !== null && !isDetailedField(value);
}
function flattenSchema(schema, pathPrefix = []) {
  const fields = [];
  for (const [key, value] of Object.entries(schema)) {
    const currentPath = [...pathPrefix, key];
    const pathString = currentPath.join(".");
    if (isFieldType(value)) {
      fields.push({
        path: pathString,
        type: value
      });
    } else if (isDetailedField(value)) {
      fields.push({
        path: pathString,
        type: value.type,
        fast: "fast" in value ? value.fast : void 0,
        noTokenize: "noTokenize" in value ? value.noTokenize : void 0,
        noStem: "noStem" in value ? value.noStem : void 0,
        from: "from" in value ? value.from : void 0
      });
    } else if (isNestedSchema(value)) {
      const nestedFields = flattenSchema(value, currentPath);
      fields.push(...nestedFields);
    }
  }
  return fields;
}
function deserializeQueryResponse(rawResponse) {
  return rawResponse.map((itemRaw) => {
    const raw = itemRaw;
    const key = raw[0];
    const score = Number(raw[1]);
    const rawFields = raw[2];
    if (rawFields === void 0) {
      return { key, score };
    }
    if (!Array.isArray(rawFields) || rawFields.length === 0) {
      return { key, score, data: {} };
    }
    let data = {};
    for (const fieldRaw of rawFields) {
      const key2 = fieldRaw[0];
      const value = fieldRaw[1];
      const pathParts = key2.split(".");
      if (pathParts.length === 1) {
        data[key2] = value;
      } else {
        let currentObj = data;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const pathPart = pathParts[i];
          if (!(pathPart in currentObj)) {
            currentObj[pathPart] = {};
          }
          currentObj = currentObj[pathPart];
        }
        currentObj[pathParts.at(-1)] = value;
      }
    }
    if ("$" in data) {
      data = data["$"];
    }
    return { key, score, data };
  });
}
function deserializeDescribeResponse(rawResponse) {
  const description = {};
  for (let i = 0; i < rawResponse.length; i += 2) {
    const descriptor = rawResponse[i];
    switch (descriptor) {
      case "name": {
        description["name"] = rawResponse[i + 1];
        break;
      }
      case "type": {
        description["dataType"] = rawResponse[i + 1].toLowerCase();
        break;
      }
      case "prefixes": {
        description["prefixes"] = rawResponse[i + 1];
        break;
      }
      case "language": {
        description["language"] = rawResponse[i + 1];
        break;
      }
      case "schema": {
        const schema = {};
        for (const fieldDescription of rawResponse[i + 1]) {
          const fieldName = fieldDescription[0];
          const fieldInfo = { type: fieldDescription[1] };
          if (fieldDescription.length > 2) {
            for (let j = 2; j < fieldDescription.length; j++) {
              const fieldOption = fieldDescription[j];
              switch (fieldOption) {
                case "NOSTEM": {
                  fieldInfo.noStem = true;
                  break;
                }
                case "NOTOKENIZE": {
                  fieldInfo.noTokenize = true;
                  break;
                }
                case "FAST": {
                  fieldInfo.fast = true;
                  break;
                }
                case "FROM": {
                  fieldInfo.from = fieldDescription[++j];
                  break;
                }
              }
            }
          }
          schema[fieldName] = fieldInfo;
        }
        description["schema"] = schema;
        break;
      }
    }
  }
  return description;
}
function parseCountResponse(rawResponse) {
  return typeof rawResponse === "number" ? rawResponse : Number.parseInt(rawResponse, 10);
}
function deserializeAggregateResponse(rawResponse) {
  return parseAggregationArray(rawResponse);
}
function parseAggregationArray(arr2) {
  const result = {};
  for (let i = 0; i < arr2.length; i += 2) {
    const key = arr2[i];
    const value = arr2[i + 1];
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === "string") {
        result[key] = value[0] === "buckets" ? parseBucketsValue(value) : parseStatsValue(value);
      } else {
        result[key] = parseAggregationArray(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}
function coerceNumericString(value) {
  if (typeof value === "string" && value !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}
function parseStatsValue(arr2) {
  const result = {};
  for (let i = 0; i < arr2.length; i += 2) {
    const key = arr2[i];
    const value = arr2[i + 1];
    if (Array.isArray(value) && value.length > 0) {
      if (typeof value[0] === "string") {
        result[key] = parseStatsValue(value);
      } else if (Array.isArray(value[0]) && typeof value[0][0] === "string") {
        result[key] = value.map((item) => parseStatsValue(item));
      } else {
        result[key] = value;
      }
    } else {
      result[key] = coerceNumericString(value);
    }
  }
  return result;
}
function parseBucketsValue(arr2) {
  if (arr2[0] === "buckets" && Array.isArray(arr2[1])) {
    const result = {
      buckets: arr2[1].map((bucket) => {
        const bucketObj = {};
        for (let i = 0; i < bucket.length; i += 2) {
          const key = bucket[i];
          const value = bucket[i + 1];
          bucketObj[key] = Array.isArray(value) && value.length > 0 && typeof value[0] === "string" ? parseStatsValue(value) : value;
        }
        return bucketObj;
      })
    };
    for (let i = 2; i < arr2.length; i += 2) {
      result[arr2[i]] = arr2[i + 1];
    }
    return result;
  }
  return arr2;
}
function buildQueryCommand(redisCommand, name, options) {
  const query = JSON.stringify(options?.filter ?? {});
  const command = [redisCommand, name, query];
  if (options?.limit !== void 0) {
    command.push("LIMIT", options.limit.toString());
  }
  if (options?.offset !== void 0) {
    command.push("OFFSET", options.offset.toString());
  }
  if (options?.select && Object.keys(options.select).length === 0) {
    command.push("NOCONTENT");
  }
  if (options) {
    if ("orderBy" in options && options.orderBy) {
      command.push("ORDERBY");
      for (const [field, direction] of Object.entries(options.orderBy)) {
        command.push(field, direction);
      }
    } else if ("scoreFunc" in options && options.scoreFunc) {
      command.push("SCOREFUNC", ...buildScoreFunc(options.scoreFunc));
    }
  }
  if (options?.highlight) {
    command.push(
      "HIGHLIGHT",
      "FIELDS",
      options.highlight.fields.length.toString(),
      ...options.highlight.fields
    );
    if (options.highlight.preTag && options.highlight.postTag) {
      command.push("TAGS", options.highlight.preTag, options.highlight.postTag);
    }
  }
  if (options?.select && Object.keys(options.select).length > 0) {
    command.push(
      "SELECT",
      Object.keys(options.select).length.toString(),
      ...Object.keys(options.select)
    );
  }
  return command;
}
function buildScoreFunc(scoreBy) {
  const result = [];
  if (typeof scoreBy === "string") {
    result.push("FIELDVALUE", scoreBy);
  } else if ("fields" in scoreBy) {
    if (scoreBy.combineMode) {
      result.push("COMBINEMODE", scoreBy.combineMode.toUpperCase());
    }
    if (scoreBy.scoreMode) {
      result.push("SCOREMODE", scoreBy.scoreMode.toUpperCase());
    }
    for (const field of scoreBy.fields) {
      result.push(...buildScoreFuncField(field));
    }
  } else {
    result.push(...buildScoreFuncField(scoreBy));
  }
  return result;
}
function buildScoreFuncField(field) {
  const result = [];
  if (typeof field === "string") {
    result.push("FIELDVALUE", field);
  } else {
    if (field.scoreMode) {
      result.push("SCOREMODE", field.scoreMode.toUpperCase());
    }
    result.push("FIELDVALUE", field.field);
    if (field.modifier) {
      result.push("MODIFIER", field.modifier.toUpperCase());
    }
    if (field.factor !== void 0) {
      result.push("FACTOR", field.factor.toString());
    }
    if (field.missing !== void 0) {
      result.push("MISSING", field.missing.toString());
    }
  }
  return result;
}
function buildCreateIndexCommand(params) {
  const { name, schema, dataType, prefix, language, skipInitialScan, existsOk } = params;
  const prefixArray = Array.isArray(prefix) ? prefix : [prefix];
  const payload = [
    name,
    ...skipInitialScan ? ["SKIPINITIALSCAN"] : [],
    ...existsOk ? ["EXISTSOK"] : [],
    "ON",
    dataType.toUpperCase(),
    "PREFIX",
    prefixArray.length.toString(),
    ...prefixArray,
    ...language ? ["LANGUAGE", language] : [],
    "SCHEMA"
  ];
  const fields = flattenSchema(schema);
  for (const field of fields) {
    payload.push(field.path, field.type);
    if (field.fast) {
      payload.push("FAST");
    }
    if (field.noTokenize) {
      payload.push("NOTOKENIZE");
    }
    if (field.noStem) {
      payload.push("NOSTEM");
    }
    if (field.from) {
      payload.push("FROM", field.from);
    }
  }
  return ["SEARCH.CREATE", ...payload];
}
function buildAggregateCommand(name, options) {
  const query = JSON.stringify(options?.filter ?? {});
  const aggregations = JSON.stringify(options.aggregations);
  return ["SEARCH.AGGREGATE", name, query, aggregations];
}
var SearchIndex = class {
  name;
  schema;
  client;
  constructor({ name, schema, client: client2 }) {
    this.name = name;
    this.schema = schema;
    this.client = client2;
  }
  async waitIndexing() {
    const command = ["SEARCH.WAITINDEXING", this.name];
    return await new ExecCommand(command).exec(this.client);
  }
  async describe() {
    const command = ["SEARCH.DESCRIBE", this.name];
    const rawResult = await new ExecCommand(command).exec(
      this.client
    );
    if (!rawResult) return null;
    return deserializeDescribeResponse(rawResult);
  }
  async query(options) {
    const command = buildQueryCommand("SEARCH.QUERY", this.name, options);
    const rawResult = await new ExecCommand(command).exec(
      this.client
    );
    if (!rawResult) return rawResult;
    return deserializeQueryResponse(rawResult);
  }
  async aggregate(options) {
    const command = buildAggregateCommand(this.name, options);
    const rawResult = await new ExecCommand(
      command
    ).exec(this.client);
    return deserializeAggregateResponse(rawResult);
  }
  async count({ filter }) {
    const command = buildQueryCommand("SEARCH.COUNT", this.name, { filter });
    const rawResult = await new ExecCommand(command).exec(
      this.client
    );
    return { count: parseCountResponse(rawResult) };
  }
  async drop() {
    const command = ["SEARCH.DROP", this.name];
    const result = await new ExecCommand(command).exec(this.client);
    return result;
  }
  async addAlias({ alias }) {
    const command = ["SEARCH.ALIASADD", alias, this.name];
    const result = await new ExecCommand(command).exec(this.client);
    return result;
  }
};
async function createIndex(client2, params) {
  const { name, schema } = params;
  const createIndexCommand = buildCreateIndexCommand(params);
  await new ExecCommand(createIndexCommand).exec(client2);
  return initIndex(client2, { name, schema });
}
function initIndex(client2, params) {
  const { name, schema } = params;
  return new SearchIndex({ name, schema, client: client2 });
}
async function listAliases(client2) {
  const command = ["SEARCH.LISTALIASES"];
  const rawResult = await new ExecCommand(command).exec(client2);
  if (rawResult === 0 || Array.isArray(rawResult) && rawResult.length === 0) {
    return {};
  }
  if (!Array.isArray(rawResult)) {
    return {};
  }
  const aliases = {};
  for (const pair of rawResult) {
    if (Array.isArray(pair) && pair.length === 2) {
      const [alias, index] = pair;
      aliases[alias] = index;
    }
  }
  return aliases;
}
async function addAlias(client2, { indexName, alias }) {
  const command = ["SEARCH.ALIASADD", alias, indexName];
  const result = await new ExecCommand(command).exec(client2);
  return result;
}
async function delAlias(client2, { alias }) {
  const command = ["SEARCH.ALIASDEL", alias];
  const result = await new ExecCommand(command).exec(client2);
  return result;
}
function deserialize(result) {
  if (result.length === 0) {
    return null;
  }
  const obj = {};
  for (let i = 0; i < result.length; i += 2) {
    const key = result[i];
    const value = result[i + 1];
    try {
      obj[key] = JSON.parse(value);
    } catch {
      obj[key] = value;
    }
  }
  return obj;
}
var HRandFieldCommand = class extends Command {
  constructor(cmd, opts) {
    const command = ["hrandfield", cmd[0]];
    if (typeof cmd[1] === "number") {
      command.push(cmd[1]);
    }
    if (cmd[2]) {
      command.push("WITHVALUES");
    }
    super(command, {
      // @ts-expect-error to silence compiler
      deserialize: cmd[2] ? (result) => deserialize(result) : opts?.deserialize,
      ...opts
    });
  }
};
var AppendCommand = class extends Command {
  constructor(cmd, opts) {
    super(["append", ...cmd], opts);
  }
};
var BitCountCommand = class extends Command {
  constructor([key, start, end], opts) {
    const command = ["bitcount", key];
    if (typeof start === "number") {
      command.push(start);
    }
    if (typeof end === "number") {
      command.push(end);
    }
    super(command, opts);
  }
};
var BitFieldCommand = class {
  constructor(args, client2, opts, execOperation = (command) => command.exec(this.client)) {
    this.client = client2;
    this.opts = opts;
    this.execOperation = execOperation;
    this.command = ["bitfield", ...args];
  }
  command;
  chain(...args) {
    this.command.push(...args);
    return this;
  }
  get(...args) {
    return this.chain("get", ...args);
  }
  set(...args) {
    return this.chain("set", ...args);
  }
  incrby(...args) {
    return this.chain("incrby", ...args);
  }
  overflow(overflow) {
    return this.chain("overflow", overflow);
  }
  exec() {
    const command = new Command(this.command, this.opts);
    return this.execOperation(command);
  }
};
var BitOpCommand = class extends Command {
  constructor(cmd, opts) {
    super(["bitop", ...cmd], opts);
  }
};
var BitPosCommand = class extends Command {
  constructor(cmd, opts) {
    super(["bitpos", ...cmd], opts);
  }
};
var ClientSetInfoCommand = class extends Command {
  constructor([attribute, value], opts) {
    super(["CLIENT", "SETINFO", attribute.toUpperCase(), value], opts);
  }
};
var CopyCommand = class extends Command {
  constructor([key, destinationKey, opts], commandOptions) {
    super(["COPY", key, destinationKey, ...opts?.replace ? ["REPLACE"] : []], {
      ...commandOptions,
      deserialize(result) {
        if (result > 0) {
          return "COPIED";
        }
        return "NOT_COPIED";
      }
    });
  }
};
var DBSizeCommand = class extends Command {
  constructor(opts) {
    super(["dbsize"], opts);
  }
};
var DecrCommand = class extends Command {
  constructor(cmd, opts) {
    super(["decr", ...cmd], opts);
  }
};
var DecrByCommand = class extends Command {
  constructor(cmd, opts) {
    super(["decrby", ...cmd], opts);
  }
};
var DelCommand = class extends Command {
  constructor(cmd, opts) {
    super(["del", ...cmd], opts);
  }
};
var EchoCommand = class extends Command {
  constructor(cmd, opts) {
    super(["echo", ...cmd], opts);
  }
};
var EvalROCommand = class extends Command {
  constructor([script, keys, args], opts) {
    super(["eval_ro", script, keys.length, ...keys, ...args ?? []], opts);
  }
};
var EvalCommand = class extends Command {
  constructor([script, keys, args], opts) {
    super(["eval", script, keys.length, ...keys, ...args ?? []], opts);
  }
};
var EvalshaROCommand = class extends Command {
  constructor([sha, keys, args], opts) {
    super(["evalsha_ro", sha, keys.length, ...keys, ...args ?? []], opts);
  }
};
var EvalshaCommand = class extends Command {
  constructor([sha, keys, args], opts) {
    super(["evalsha", sha, keys.length, ...keys, ...args ?? []], opts);
  }
};
var ExistsCommand = class extends Command {
  constructor(cmd, opts) {
    super(["exists", ...cmd], opts);
  }
};
var ExpireCommand = class extends Command {
  constructor(cmd, opts) {
    super(["expire", ...cmd.filter(Boolean)], opts);
  }
};
var ExpireAtCommand = class extends Command {
  constructor(cmd, opts) {
    super(["expireat", ...cmd], opts);
  }
};
var FCallCommand = class extends Command {
  constructor([functionName, keys, args], opts) {
    super(["fcall", functionName, ...keys ? [keys.length, ...keys] : [0], ...args ?? []], opts);
  }
};
var FCallRoCommand = class extends Command {
  constructor([functionName, keys, args], opts) {
    super(
      ["fcall_ro", functionName, ...keys ? [keys.length, ...keys] : [0], ...args ?? []],
      opts
    );
  }
};
var FlushAllCommand = class extends Command {
  constructor(args, opts) {
    const command = ["flushall"];
    if (args && args.length > 0 && args[0].async) {
      command.push("async");
    }
    super(command, opts);
  }
};
var FlushDBCommand = class extends Command {
  constructor([opts], cmdOpts) {
    const command = ["flushdb"];
    if (opts?.async) {
      command.push("async");
    }
    super(command, cmdOpts);
  }
};
var FunctionDeleteCommand = class extends Command {
  constructor([libraryName], opts) {
    super(["function", "delete", libraryName], opts);
  }
};
var FunctionFlushCommand = class extends Command {
  constructor(opts) {
    super(["function", "flush"], opts);
  }
};
var FunctionListCommand = class extends Command {
  constructor([args], opts) {
    const command = ["function", "list"];
    if (args?.libraryName) {
      command.push("libraryname", args.libraryName);
    }
    if (args?.withCode) {
      command.push("withcode");
    }
    super(command, { deserialize: deserialize2, ...opts });
  }
};
function deserialize2(result) {
  if (!Array.isArray(result)) return [];
  return result.map((libRaw) => {
    const lib = kvArrayToObject(libRaw);
    const functionsParsed = lib.functions.map(
      (fnRaw) => kvArrayToObject(fnRaw)
    );
    return {
      libraryName: lib.library_name,
      engine: lib.engine,
      functions: functionsParsed.map((fn) => ({
        name: fn.name,
        description: fn.description ?? void 0,
        flags: fn.flags
      })),
      libraryCode: lib.library_code
    };
  });
}
var FunctionLoadCommand = class extends Command {
  constructor([args], opts) {
    super(["function", "load", ...args.replace ? ["replace"] : [], args.code], opts);
  }
};
var FunctionStatsCommand = class extends Command {
  constructor(opts) {
    super(["function", "stats"], { deserialize: deserialize3, ...opts });
  }
};
function deserialize3(result) {
  const rawEngines = kvArrayToObject(kvArrayToObject(result).engines);
  const parsedEngines = Object.fromEntries(
    Object.entries(rawEngines).map(([key, value]) => [key, kvArrayToObject(value)])
  );
  const final = {
    engines: Object.fromEntries(
      Object.entries(parsedEngines).map(([key, value]) => [
        key,
        {
          librariesCount: value.libraries_count,
          functionsCount: value.functions_count
        }
      ])
    )
  };
  return final;
}
var GeoAddCommand = class extends Command {
  constructor([key, arg1, ...arg2], opts) {
    const command = ["geoadd", key];
    if ("nx" in arg1 && arg1.nx) {
      command.push("nx");
    } else if ("xx" in arg1 && arg1.xx) {
      command.push("xx");
    }
    if ("ch" in arg1 && arg1.ch) {
      command.push("ch");
    }
    if ("latitude" in arg1 && arg1.latitude) {
      command.push(arg1.longitude, arg1.latitude, arg1.member);
    }
    command.push(
      ...arg2.flatMap(({ latitude, longitude, member }) => [longitude, latitude, member])
    );
    super(command, opts);
  }
};
var GeoDistCommand = class extends Command {
  constructor([key, member1, member2, unit = "M"], opts) {
    super(["GEODIST", key, member1, member2, unit], opts);
  }
};
var GeoHashCommand = class extends Command {
  constructor(cmd, opts) {
    const [key] = cmd;
    const members = Array.isArray(cmd[1]) ? cmd[1] : cmd.slice(1);
    super(["GEOHASH", key, ...members], opts);
  }
};
var GeoPosCommand = class extends Command {
  constructor(cmd, opts) {
    const [key] = cmd;
    const members = Array.isArray(cmd[1]) ? cmd[1] : cmd.slice(1);
    super(["GEOPOS", key, ...members], {
      deserialize: (result) => transform(result),
      ...opts
    });
  }
};
function transform(result) {
  const final = [];
  for (const pos of result) {
    if (!pos?.[0] || !pos?.[1]) {
      continue;
    }
    final.push({ lng: Number.parseFloat(pos[0]), lat: Number.parseFloat(pos[1]) });
  }
  return final;
}
var GeoSearchCommand = class extends Command {
  constructor([key, centerPoint, shape, order, opts], commandOptions) {
    const command = ["GEOSEARCH", key];
    if (centerPoint.type === "FROMMEMBER" || centerPoint.type === "frommember") {
      command.push(centerPoint.type, centerPoint.member);
    }
    if (centerPoint.type === "FROMLONLAT" || centerPoint.type === "fromlonlat") {
      command.push(centerPoint.type, centerPoint.coordinate.lon, centerPoint.coordinate.lat);
    }
    if (shape.type === "BYRADIUS" || shape.type === "byradius") {
      command.push(shape.type, shape.radius, shape.radiusType);
    }
    if (shape.type === "BYBOX" || shape.type === "bybox") {
      command.push(shape.type, shape.rect.width, shape.rect.height, shape.rectType);
    }
    command.push(order);
    if (opts?.count) {
      command.push("COUNT", opts.count.limit, ...opts.count.any ? ["ANY"] : []);
    }
    const transform2 = (result) => {
      if (!opts?.withCoord && !opts?.withDist && !opts?.withHash) {
        return result.map((member) => {
          try {
            return { member: JSON.parse(member) };
          } catch {
            return { member };
          }
        });
      }
      return result.map((members) => {
        let counter = 1;
        const obj = {};
        try {
          obj.member = JSON.parse(members[0]);
        } catch {
          obj.member = members[0];
        }
        if (opts.withDist) {
          obj.dist = Number.parseFloat(members[counter++]);
        }
        if (opts.withHash) {
          obj.hash = members[counter++].toString();
        }
        if (opts.withCoord) {
          obj.coord = {
            long: Number.parseFloat(members[counter][0]),
            lat: Number.parseFloat(members[counter][1])
          };
        }
        return obj;
      });
    };
    super(
      [
        ...command,
        ...opts?.withCoord ? ["WITHCOORD"] : [],
        ...opts?.withDist ? ["WITHDIST"] : [],
        ...opts?.withHash ? ["WITHHASH"] : []
      ],
      {
        deserialize: transform2,
        ...commandOptions
      }
    );
  }
};
var GeoSearchStoreCommand = class extends Command {
  constructor([destination, key, centerPoint, shape, order, opts], commandOptions) {
    const command = ["GEOSEARCHSTORE", destination, key];
    if (centerPoint.type === "FROMMEMBER" || centerPoint.type === "frommember") {
      command.push(centerPoint.type, centerPoint.member);
    }
    if (centerPoint.type === "FROMLONLAT" || centerPoint.type === "fromlonlat") {
      command.push(centerPoint.type, centerPoint.coordinate.lon, centerPoint.coordinate.lat);
    }
    if (shape.type === "BYRADIUS" || shape.type === "byradius") {
      command.push(shape.type, shape.radius, shape.radiusType);
    }
    if (shape.type === "BYBOX" || shape.type === "bybox") {
      command.push(shape.type, shape.rect.width, shape.rect.height, shape.rectType);
    }
    command.push(order);
    if (opts?.count) {
      command.push("COUNT", opts.count.limit, ...opts.count.any ? ["ANY"] : []);
    }
    super([...command, ...opts?.storeDist ? ["STOREDIST"] : []], commandOptions);
  }
};
var GetCommand = class extends Command {
  constructor(cmd, opts) {
    super(["get", ...cmd], opts);
  }
};
var GetBitCommand = class extends Command {
  constructor(cmd, opts) {
    super(["getbit", ...cmd], opts);
  }
};
var GetDelCommand = class extends Command {
  constructor(cmd, opts) {
    super(["getdel", ...cmd], opts);
  }
};
var GetExCommand = class extends Command {
  constructor([key, opts], cmdOpts) {
    const command = ["getex", key];
    if (opts) {
      if ("ex" in opts && typeof opts.ex === "number") {
        command.push("ex", opts.ex);
      } else if ("px" in opts && typeof opts.px === "number") {
        command.push("px", opts.px);
      } else if ("exat" in opts && typeof opts.exat === "number") {
        command.push("exat", opts.exat);
      } else if ("pxat" in opts && typeof opts.pxat === "number") {
        command.push("pxat", opts.pxat);
      } else if ("persist" in opts && opts.persist) {
        command.push("persist");
      }
    }
    super(command, cmdOpts);
  }
};
var GetRangeCommand = class extends Command {
  constructor(cmd, opts) {
    super(["getrange", ...cmd], opts);
  }
};
var GetSetCommand = class extends Command {
  constructor(cmd, opts) {
    super(["getset", ...cmd], opts);
  }
};
var HDelCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hdel", ...cmd], opts);
  }
};
var HExistsCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hexists", ...cmd], opts);
  }
};
var HExpireCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields, seconds, option] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(
      [
        "hexpire",
        key,
        seconds,
        ...option ? [option] : [],
        "FIELDS",
        fieldArray.length,
        ...fieldArray
      ],
      opts
    );
  }
};
var HExpireAtCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields, timestamp, option] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(
      [
        "hexpireat",
        key,
        timestamp,
        ...option ? [option] : [],
        "FIELDS",
        fieldArray.length,
        ...fieldArray
      ],
      opts
    );
  }
};
var HExpireTimeCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(["hexpiretime", key, "FIELDS", fieldArray.length, ...fieldArray], opts);
  }
};
var HPersistCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(["hpersist", key, "FIELDS", fieldArray.length, ...fieldArray], opts);
  }
};
var HPExpireCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields, milliseconds, option] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(
      [
        "hpexpire",
        key,
        milliseconds,
        ...option ? [option] : [],
        "FIELDS",
        fieldArray.length,
        ...fieldArray
      ],
      opts
    );
  }
};
var HPExpireAtCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields, timestamp, option] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(
      [
        "hpexpireat",
        key,
        timestamp,
        ...option ? [option] : [],
        "FIELDS",
        fieldArray.length,
        ...fieldArray
      ],
      opts
    );
  }
};
var HPExpireTimeCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(["hpexpiretime", key, "FIELDS", fieldArray.length, ...fieldArray], opts);
  }
};
var HPTtlCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(["hpttl", key, "FIELDS", fieldArray.length, ...fieldArray], opts);
  }
};
var HGetCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hget", ...cmd], opts);
  }
};
function deserialize4(result) {
  if (result.length === 0) {
    return null;
  }
  const obj = {};
  for (let i = 0; i < result.length; i += 2) {
    const key = result[i];
    const value = result[i + 1];
    try {
      const valueIsNumberAndNotSafeInteger = !Number.isNaN(Number(value)) && !Number.isSafeInteger(Number(value));
      obj[key] = valueIsNumberAndNotSafeInteger ? value : JSON.parse(value);
    } catch {
      obj[key] = value;
    }
  }
  return obj;
}
var HGetAllCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hgetall", ...cmd], {
      deserialize: (result) => deserialize4(result),
      ...opts
    });
  }
};
function deserialize5(fields, result) {
  if (result.every((field) => field === null)) {
    return null;
  }
  const obj = {};
  for (const [i, field] of fields.entries()) {
    try {
      obj[field] = JSON.parse(result[i]);
    } catch {
      obj[field] = result[i];
    }
  }
  return obj;
}
var HMGetCommand = class extends Command {
  constructor([key, ...fields], opts) {
    super(["hmget", key, ...fields], {
      deserialize: (result) => deserialize5(fields, result),
      ...opts
    });
  }
};
var HGetDelCommand = class extends Command {
  constructor([key, ...fields], opts) {
    super(["hgetdel", key, "FIELDS", fields.length, ...fields], {
      deserialize: (result) => deserialize5(fields.map(String), result),
      ...opts
    });
  }
};
var HGetExCommand = class extends Command {
  constructor([key, opts, ...fields], cmdOpts) {
    const command = ["hgetex", key];
    if ("ex" in opts && typeof opts.ex === "number") {
      command.push("EX", opts.ex);
    } else if ("px" in opts && typeof opts.px === "number") {
      command.push("PX", opts.px);
    } else if ("exat" in opts && typeof opts.exat === "number") {
      command.push("EXAT", opts.exat);
    } else if ("pxat" in opts && typeof opts.pxat === "number") {
      command.push("PXAT", opts.pxat);
    } else if ("persist" in opts && opts.persist) {
      command.push("PERSIST");
    }
    command.push("FIELDS", fields.length, ...fields);
    super(command, {
      deserialize: (result) => deserialize5(fields.map(String), result),
      ...cmdOpts
    });
  }
};
var HIncrByCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hincrby", ...cmd], opts);
  }
};
var HIncrByFloatCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hincrbyfloat", ...cmd], opts);
  }
};
var HKeysCommand = class extends Command {
  constructor([key], opts) {
    super(["hkeys", key], opts);
  }
};
var HLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hlen", ...cmd], opts);
  }
};
var HMSetCommand = class extends Command {
  constructor([key, kv2], opts) {
    super(["hmset", key, ...Object.entries(kv2).flatMap(([field, value]) => [field, value])], opts);
  }
};
var HScanCommand = class extends Command {
  constructor([key, cursor, cmdOpts], opts) {
    const command = ["hscan", key, cursor];
    if (cmdOpts?.match) {
      command.push("match", cmdOpts.match);
    }
    if (typeof cmdOpts?.count === "number") {
      command.push("count", cmdOpts.count);
    }
    super(command, {
      deserialize: deserializeScanResponse,
      ...opts
    });
  }
};
var HSetCommand = class extends Command {
  constructor([key, kv2], opts) {
    super(["hset", key, ...Object.entries(kv2).flatMap(([field, value]) => [field, value])], opts);
  }
};
var HSetExCommand = class extends Command {
  constructor([key, opts, kv2], cmdOpts) {
    const command = ["hsetex", key];
    if (opts.conditional) {
      command.push(opts.conditional.toUpperCase());
    }
    if (opts.expiration) {
      if ("ex" in opts.expiration && typeof opts.expiration.ex === "number") {
        command.push("EX", opts.expiration.ex);
      } else if ("px" in opts.expiration && typeof opts.expiration.px === "number") {
        command.push("PX", opts.expiration.px);
      } else if ("exat" in opts.expiration && typeof opts.expiration.exat === "number") {
        command.push("EXAT", opts.expiration.exat);
      } else if ("pxat" in opts.expiration && typeof opts.expiration.pxat === "number") {
        command.push("PXAT", opts.expiration.pxat);
      } else if ("keepttl" in opts.expiration && opts.expiration.keepttl) {
        command.push("KEEPTTL");
      }
    }
    const entries = Object.entries(kv2);
    command.push("FIELDS", entries.length);
    for (const [field, value] of entries) {
      command.push(field, value);
    }
    super(command, cmdOpts);
  }
};
var HSetNXCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hsetnx", ...cmd], opts);
  }
};
var HStrLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hstrlen", ...cmd], opts);
  }
};
var HTtlCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, fields] = cmd;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    super(["httl", key, "FIELDS", fieldArray.length, ...fieldArray], opts);
  }
};
var HValsCommand = class extends Command {
  constructor(cmd, opts) {
    super(["hvals", ...cmd], opts);
  }
};
var IncrCommand = class extends Command {
  constructor(cmd, opts) {
    super(["incr", ...cmd], opts);
  }
};
var IncrByCommand = class extends Command {
  constructor(cmd, opts) {
    super(["incrby", ...cmd], opts);
  }
};
var IncrByFloatCommand = class extends Command {
  constructor(cmd, opts) {
    super(["incrbyfloat", ...cmd], opts);
  }
};
var JsonArrAppendCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.ARRAPPEND", ...cmd], opts);
  }
};
var JsonArrIndexCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.ARRINDEX", ...cmd], opts);
  }
};
var JsonArrInsertCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.ARRINSERT", ...cmd], opts);
  }
};
var JsonArrLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.ARRLEN", cmd[0], cmd[1] ?? "$"], opts);
  }
};
var JsonArrPopCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.ARRPOP", ...cmd], opts);
  }
};
var JsonArrTrimCommand = class extends Command {
  constructor(cmd, opts) {
    const path = cmd[1] ?? "$";
    const start = cmd[2] ?? 0;
    const stop = cmd[3] ?? 0;
    super(["JSON.ARRTRIM", cmd[0], path, start, stop], opts);
  }
};
var JsonClearCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.CLEAR", ...cmd], opts);
  }
};
var JsonDelCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.DEL", ...cmd], opts);
  }
};
var JsonForgetCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.FORGET", ...cmd], opts);
  }
};
var JsonGetCommand = class extends Command {
  constructor(cmd, opts) {
    const command = ["JSON.GET"];
    if (typeof cmd[1] === "string") {
      command.push(...cmd);
    } else {
      command.push(cmd[0]);
      if (cmd[1]) {
        if (cmd[1].indent) {
          command.push("INDENT", cmd[1].indent);
        }
        if (cmd[1].newline) {
          command.push("NEWLINE", cmd[1].newline);
        }
        if (cmd[1].space) {
          command.push("SPACE", cmd[1].space);
        }
      }
      command.push(...cmd.slice(2));
    }
    super(command, opts);
  }
};
var JsonMergeCommand = class extends Command {
  constructor(cmd, opts) {
    const command = ["JSON.MERGE", ...cmd];
    super(command, opts);
  }
};
var JsonMGetCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.MGET", ...cmd[0], cmd[1]], opts);
  }
};
var JsonMSetCommand = class extends Command {
  constructor(cmd, opts) {
    const command = ["JSON.MSET"];
    for (const c of cmd) {
      command.push(c.key, c.path, c.value);
    }
    super(command, opts);
  }
};
var JsonNumIncrByCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.NUMINCRBY", ...cmd], opts);
  }
};
var JsonNumMultByCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.NUMMULTBY", ...cmd], opts);
  }
};
var JsonObjKeysCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.OBJKEYS", ...cmd], opts);
  }
};
var JsonObjLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.OBJLEN", ...cmd], opts);
  }
};
var JsonRespCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.RESP", ...cmd], opts);
  }
};
var JsonSetCommand = class extends Command {
  constructor(cmd, opts) {
    const command = ["JSON.SET", cmd[0], cmd[1], cmd[2]];
    if (cmd[3]) {
      if (cmd[3].nx) {
        command.push("NX");
      } else if (cmd[3].xx) {
        command.push("XX");
      }
    }
    super(command, opts);
  }
};
var JsonStrAppendCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.STRAPPEND", ...cmd], opts);
  }
};
var JsonStrLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.STRLEN", ...cmd], opts);
  }
};
var JsonToggleCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.TOGGLE", ...cmd], opts);
  }
};
var JsonTypeCommand = class extends Command {
  constructor(cmd, opts) {
    super(["JSON.TYPE", ...cmd], opts);
  }
};
var KeysCommand = class extends Command {
  constructor(cmd, opts) {
    super(["keys", ...cmd], opts);
  }
};
var LIndexCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lindex", ...cmd], opts);
  }
};
var LInsertCommand = class extends Command {
  constructor(cmd, opts) {
    super(["linsert", ...cmd], opts);
  }
};
var LLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["llen", ...cmd], opts);
  }
};
var LMoveCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lmove", ...cmd], opts);
  }
};
var LmPopCommand = class extends Command {
  constructor(cmd, opts) {
    const [numkeys, keys, direction, count] = cmd;
    super(["LMPOP", numkeys, ...keys, direction, ...count ? ["COUNT", count] : []], opts);
  }
};
var LPopCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lpop", ...cmd], opts);
  }
};
var LPosCommand = class extends Command {
  constructor(cmd, opts) {
    const args = ["lpos", cmd[0], cmd[1]];
    if (typeof cmd[2]?.rank === "number") {
      args.push("rank", cmd[2].rank);
    }
    if (typeof cmd[2]?.count === "number") {
      args.push("count", cmd[2].count);
    }
    if (typeof cmd[2]?.maxLen === "number") {
      args.push("maxLen", cmd[2].maxLen);
    }
    super(args, opts);
  }
};
var LPushCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lpush", ...cmd], opts);
  }
};
var LPushXCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lpushx", ...cmd], opts);
  }
};
var LRangeCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lrange", ...cmd], opts);
  }
};
var LRemCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lrem", ...cmd], opts);
  }
};
var LSetCommand = class extends Command {
  constructor(cmd, opts) {
    super(["lset", ...cmd], opts);
  }
};
var LTrimCommand = class extends Command {
  constructor(cmd, opts) {
    super(["ltrim", ...cmd], opts);
  }
};
var MGetCommand = class extends Command {
  constructor(cmd, opts) {
    const keys = Array.isArray(cmd[0]) ? cmd[0] : cmd;
    super(["mget", ...keys], opts);
  }
};
var MSetCommand = class extends Command {
  constructor([kv2], opts) {
    super(["mset", ...Object.entries(kv2).flatMap(([key, value]) => [key, value])], opts);
  }
};
var MSetNXCommand = class extends Command {
  constructor([kv2], opts) {
    super(["msetnx", ...Object.entries(kv2).flat()], opts);
  }
};
var PersistCommand = class extends Command {
  constructor(cmd, opts) {
    super(["persist", ...cmd], opts);
  }
};
var PExpireCommand = class extends Command {
  constructor(cmd, opts) {
    super(["pexpire", ...cmd], opts);
  }
};
var PExpireAtCommand = class extends Command {
  constructor(cmd, opts) {
    super(["pexpireat", ...cmd], opts);
  }
};
var PfAddCommand = class extends Command {
  constructor(cmd, opts) {
    super(["pfadd", ...cmd], opts);
  }
};
var PfCountCommand = class extends Command {
  constructor(cmd, opts) {
    super(["pfcount", ...cmd], opts);
  }
};
var PfMergeCommand = class extends Command {
  constructor(cmd, opts) {
    super(["pfmerge", ...cmd], opts);
  }
};
var PingCommand = class extends Command {
  constructor(cmd, opts) {
    const command = ["ping"];
    if (cmd?.[0] !== void 0) {
      command.push(cmd[0]);
    }
    super(command, opts);
  }
};
var PSetEXCommand = class extends Command {
  constructor(cmd, opts) {
    super(["psetex", ...cmd], opts);
  }
};
var PTtlCommand = class extends Command {
  constructor(cmd, opts) {
    super(["pttl", ...cmd], opts);
  }
};
var PublishCommand = class extends Command {
  constructor(cmd, opts) {
    super(["publish", ...cmd], opts);
  }
};
var RandomKeyCommand = class extends Command {
  constructor(opts) {
    super(["randomkey"], opts);
  }
};
var RenameCommand = class extends Command {
  constructor(cmd, opts) {
    super(["rename", ...cmd], opts);
  }
};
var RenameNXCommand = class extends Command {
  constructor(cmd, opts) {
    super(["renamenx", ...cmd], opts);
  }
};
var RPopCommand = class extends Command {
  constructor(cmd, opts) {
    super(["rpop", ...cmd], opts);
  }
};
var RPushCommand = class extends Command {
  constructor(cmd, opts) {
    super(["rpush", ...cmd], opts);
  }
};
var RPushXCommand = class extends Command {
  constructor(cmd, opts) {
    super(["rpushx", ...cmd], opts);
  }
};
var SAddCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sadd", ...cmd], opts);
  }
};
var ScanCommand = class extends Command {
  constructor([cursor, opts], cmdOpts) {
    const command = ["scan", cursor];
    if (opts?.match) {
      command.push("match", opts.match);
    }
    if (typeof opts?.count === "number") {
      command.push("count", opts.count);
    }
    if (opts && "withType" in opts && opts.withType === true) {
      command.push("withtype");
    } else if (opts && "type" in opts && opts.type && opts.type.length > 0) {
      command.push("type", opts.type);
    }
    super(command, {
      // @ts-expect-error ignore types here
      deserialize: opts?.withType ? deserializeScanWithTypesResponse : deserializeScanResponse,
      ...cmdOpts
    });
  }
};
var SCardCommand = class extends Command {
  constructor(cmd, opts) {
    super(["scard", ...cmd], opts);
  }
};
var ScriptExistsCommand = class extends Command {
  constructor(hashes, opts) {
    super(["script", "exists", ...hashes], {
      deserialize: (result) => result,
      ...opts
    });
  }
};
var ScriptFlushCommand = class extends Command {
  constructor([opts], cmdOpts) {
    const cmd = ["script", "flush"];
    if (opts?.sync) {
      cmd.push("sync");
    } else if (opts?.async) {
      cmd.push("async");
    }
    super(cmd, cmdOpts);
  }
};
var ScriptLoadCommand = class extends Command {
  constructor(args, opts) {
    super(["script", "load", ...args], opts);
  }
};
var SDiffCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sdiff", ...cmd], opts);
  }
};
var SDiffStoreCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sdiffstore", ...cmd], opts);
  }
};
var SetCommand = class extends Command {
  constructor([key, value, opts], cmdOpts) {
    const command = ["set", key, value];
    if (opts) {
      if ("nx" in opts && opts.nx) {
        command.push("nx");
      } else if ("xx" in opts && opts.xx) {
        command.push("xx");
      }
      if ("get" in opts && opts.get) {
        command.push("get");
      }
      if ("ex" in opts && typeof opts.ex === "number") {
        command.push("ex", opts.ex);
      } else if ("px" in opts && typeof opts.px === "number") {
        command.push("px", opts.px);
      } else if ("exat" in opts && typeof opts.exat === "number") {
        command.push("exat", opts.exat);
      } else if ("pxat" in opts && typeof opts.pxat === "number") {
        command.push("pxat", opts.pxat);
      } else if ("keepTtl" in opts && opts.keepTtl) {
        command.push("keepTtl");
      }
    }
    super(command, cmdOpts);
  }
};
var SetBitCommand = class extends Command {
  constructor(cmd, opts) {
    super(["setbit", ...cmd], opts);
  }
};
var SetExCommand = class extends Command {
  constructor(cmd, opts) {
    super(["setex", ...cmd], opts);
  }
};
var SetNxCommand = class extends Command {
  constructor(cmd, opts) {
    super(["setnx", ...cmd], opts);
  }
};
var SetRangeCommand = class extends Command {
  constructor(cmd, opts) {
    super(["setrange", ...cmd], opts);
  }
};
var SInterCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sinter", ...cmd], opts);
  }
};
var SInterCardCommand = class extends Command {
  constructor(cmd, cmdOpts) {
    const [keys, opts] = cmd;
    const command = ["sintercard", keys.length, ...keys];
    if (opts?.limit !== void 0) {
      command.push("LIMIT", opts.limit);
    }
    super(command, cmdOpts);
  }
};
var SInterStoreCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sinterstore", ...cmd], opts);
  }
};
var SIsMemberCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sismember", ...cmd], opts);
  }
};
var SMembersCommand = class extends Command {
  constructor(cmd, opts) {
    super(["smembers", ...cmd], opts);
  }
};
var SMIsMemberCommand = class extends Command {
  constructor(cmd, opts) {
    super(["smismember", cmd[0], ...cmd[1]], opts);
  }
};
var SMoveCommand = class extends Command {
  constructor(cmd, opts) {
    super(["smove", ...cmd], opts);
  }
};
var SPopCommand = class extends Command {
  constructor([key, count], opts) {
    const command = ["spop", key];
    if (typeof count === "number") {
      command.push(count);
    }
    super(command, opts);
  }
};
var SRandMemberCommand = class extends Command {
  constructor([key, count], opts) {
    const command = ["srandmember", key];
    if (typeof count === "number") {
      command.push(count);
    }
    super(command, opts);
  }
};
var SRemCommand = class extends Command {
  constructor(cmd, opts) {
    super(["srem", ...cmd], opts);
  }
};
var SScanCommand = class extends Command {
  constructor([key, cursor, opts], cmdOpts) {
    const command = ["sscan", key, cursor];
    if (opts?.match) {
      command.push("match", opts.match);
    }
    if (typeof opts?.count === "number") {
      command.push("count", opts.count);
    }
    super(command, {
      deserialize: deserializeScanResponse,
      ...cmdOpts
    });
  }
};
var StrLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["strlen", ...cmd], opts);
  }
};
var SUnionCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sunion", ...cmd], opts);
  }
};
var SUnionStoreCommand = class extends Command {
  constructor(cmd, opts) {
    super(["sunionstore", ...cmd], opts);
  }
};
var TimeCommand = class extends Command {
  constructor(opts) {
    super(["time"], opts);
  }
};
var TouchCommand = class extends Command {
  constructor(cmd, opts) {
    super(["touch", ...cmd], opts);
  }
};
var TtlCommand = class extends Command {
  constructor(cmd, opts) {
    super(["ttl", ...cmd], opts);
  }
};
var TypeCommand = class extends Command {
  constructor(cmd, opts) {
    super(["type", ...cmd], opts);
  }
};
var UnlinkCommand = class extends Command {
  constructor(cmd, opts) {
    super(["unlink", ...cmd], opts);
  }
};
var XAckCommand = class extends Command {
  constructor([key, group, id], opts) {
    const ids = Array.isArray(id) ? [...id] : [id];
    super(["XACK", key, group, ...ids], opts);
  }
};
var XAckDelCommand = class extends Command {
  constructor([key, group, opts, ...ids], cmdOpts) {
    const command = ["XACKDEL", key, group];
    command.push(opts.toUpperCase(), "IDS", ids.length, ...ids);
    super(command, cmdOpts);
  }
};
var XAddCommand = class extends Command {
  constructor([key, id, entries, opts], commandOptions) {
    const command = ["XADD", key];
    if (opts) {
      if (opts.nomkStream) {
        command.push("NOMKSTREAM");
      }
      if (opts.trim) {
        command.push(opts.trim.type, opts.trim.comparison, opts.trim.threshold);
        if (opts.trim.limit !== void 0) {
          command.push("LIMIT", opts.trim.limit);
        }
      }
    }
    command.push(id);
    for (const [k, v] of Object.entries(entries)) {
      command.push(k, v);
    }
    super(command, commandOptions);
  }
};
var XAutoClaim = class extends Command {
  constructor([key, group, consumer, minIdleTime, start, options], opts) {
    const commands = [];
    if (options?.count) {
      commands.push("COUNT", options.count);
    }
    if (options?.justId) {
      commands.push("JUSTID");
    }
    super(["XAUTOCLAIM", key, group, consumer, minIdleTime, start, ...commands], opts);
  }
};
var XClaimCommand = class extends Command {
  constructor([key, group, consumer, minIdleTime, id, options], opts) {
    const ids = Array.isArray(id) ? [...id] : [id];
    const commands = [];
    if (options?.idleMS) {
      commands.push("IDLE", options.idleMS);
    }
    if (options?.idleMS) {
      commands.push("TIME", options.timeMS);
    }
    if (options?.retryCount) {
      commands.push("RETRYCOUNT", options.retryCount);
    }
    if (options?.force) {
      commands.push("FORCE");
    }
    if (options?.justId) {
      commands.push("JUSTID");
    }
    if (options?.lastId) {
      commands.push("LASTID", options.lastId);
    }
    super(["XCLAIM", key, group, consumer, minIdleTime, ...ids, ...commands], opts);
  }
};
var XDelCommand = class extends Command {
  constructor([key, ids], opts) {
    const cmds = Array.isArray(ids) ? [...ids] : [ids];
    super(["XDEL", key, ...cmds], opts);
  }
};
var XDelExCommand = class extends Command {
  constructor([key, opts, ...ids], cmdOpts) {
    const command = ["XDELEX", key];
    if (opts) {
      command.push(opts.toUpperCase());
    }
    command.push("IDS", ids.length, ...ids);
    super(command, cmdOpts);
  }
};
var XGroupCommand = class extends Command {
  constructor([key, opts], commandOptions) {
    const command = ["XGROUP"];
    switch (opts.type) {
      case "CREATE": {
        command.push("CREATE", key, opts.group, opts.id);
        if (opts.options) {
          if (opts.options.MKSTREAM) {
            command.push("MKSTREAM");
          }
          if (opts.options.ENTRIESREAD !== void 0) {
            command.push("ENTRIESREAD", opts.options.ENTRIESREAD.toString());
          }
        }
        break;
      }
      case "CREATECONSUMER": {
        command.push("CREATECONSUMER", key, opts.group, opts.consumer);
        break;
      }
      case "DELCONSUMER": {
        command.push("DELCONSUMER", key, opts.group, opts.consumer);
        break;
      }
      case "DESTROY": {
        command.push("DESTROY", key, opts.group);
        break;
      }
      case "SETID": {
        command.push("SETID", key, opts.group, opts.id);
        if (opts.options?.ENTRIESREAD !== void 0) {
          command.push("ENTRIESREAD", opts.options.ENTRIESREAD.toString());
        }
        break;
      }
      default: {
        throw new Error("Invalid XGROUP");
      }
    }
    super(command, commandOptions);
  }
};
var XInfoCommand = class extends Command {
  constructor([key, options], opts) {
    const cmds = [];
    if (options.type === "CONSUMERS") {
      cmds.push("CONSUMERS", key, options.group);
    } else {
      cmds.push("GROUPS", key);
    }
    super(["XINFO", ...cmds], opts);
  }
};
var XLenCommand = class extends Command {
  constructor(cmd, opts) {
    super(["XLEN", ...cmd], opts);
  }
};
var XPendingCommand = class extends Command {
  constructor([key, group, start, end, count, options], opts) {
    const consumers = options?.consumer === void 0 ? [] : Array.isArray(options.consumer) ? [...options.consumer] : [options.consumer];
    super(
      [
        "XPENDING",
        key,
        group,
        ...options?.idleTime ? ["IDLE", options.idleTime] : [],
        start,
        end,
        count,
        ...consumers
      ],
      opts
    );
  }
};
function deserialize6(result) {
  const obj = {};
  for (const e of result) {
    for (let i = 0; i < e.length; i += 2) {
      const streamId = e[i];
      const entries = e[i + 1];
      if (!(streamId in obj)) {
        obj[streamId] = {};
      }
      for (let j = 0; j < entries.length; j += 2) {
        const field = entries[j];
        const value = entries[j + 1];
        try {
          obj[streamId][field] = JSON.parse(value);
        } catch {
          obj[streamId][field] = value;
        }
      }
    }
  }
  return obj;
}
var XRangeCommand = class extends Command {
  constructor([key, start, end, count], opts) {
    const command = ["XRANGE", key, start, end];
    if (typeof count === "number") {
      command.push("COUNT", count);
    }
    super(command, {
      deserialize: (result) => deserialize6(result),
      ...opts
    });
  }
};
var UNBALANCED_XREAD_ERR = "ERR Unbalanced XREAD list of streams: for each stream key an ID or '$' must be specified";
var XReadCommand = class extends Command {
  constructor([key, id, options], opts) {
    if (Array.isArray(key) && Array.isArray(id) && key.length !== id.length) {
      throw new Error(UNBALANCED_XREAD_ERR);
    }
    const commands = [];
    if (typeof options?.count === "number") {
      commands.push("COUNT", options.count);
    }
    if (typeof options?.blockMS === "number") {
      commands.push("BLOCK", options.blockMS);
    }
    commands.push(
      "STREAMS",
      ...Array.isArray(key) ? [...key] : [key],
      ...Array.isArray(id) ? [...id] : [id]
    );
    super(["XREAD", ...commands], opts);
  }
};
var UNBALANCED_XREADGROUP_ERR = "ERR Unbalanced XREADGROUP list of streams: for each stream key an ID or '$' must be specified";
var XReadGroupCommand = class extends Command {
  constructor([group, consumer, key, id, options], opts) {
    if (Array.isArray(key) && Array.isArray(id) && key.length !== id.length) {
      throw new Error(UNBALANCED_XREADGROUP_ERR);
    }
    const commands = [];
    if (typeof options?.count === "number") {
      commands.push("COUNT", options.count);
    }
    if (typeof options?.blockMS === "number") {
      commands.push("BLOCK", options.blockMS);
    }
    if (typeof options?.NOACK === "boolean" && options.NOACK) {
      commands.push("NOACK");
    }
    commands.push(
      "STREAMS",
      ...Array.isArray(key) ? [...key] : [key],
      ...Array.isArray(id) ? [...id] : [id]
    );
    super(["XREADGROUP", "GROUP", group, consumer, ...commands], opts);
  }
};
var XRevRangeCommand = class extends Command {
  constructor([key, end, start, count], opts) {
    const command = ["XREVRANGE", key, end, start];
    if (typeof count === "number") {
      command.push("COUNT", count);
    }
    super(command, {
      deserialize: (result) => deserialize7(result),
      ...opts
    });
  }
};
function deserialize7(result) {
  const obj = {};
  for (const e of result) {
    for (let i = 0; i < e.length; i += 2) {
      const streamId = e[i];
      const entries = e[i + 1];
      if (!(streamId in obj)) {
        obj[streamId] = {};
      }
      for (let j = 0; j < entries.length; j += 2) {
        const field = entries[j];
        const value = entries[j + 1];
        try {
          obj[streamId][field] = JSON.parse(value);
        } catch {
          obj[streamId][field] = value;
        }
      }
    }
  }
  return obj;
}
var XTrimCommand = class extends Command {
  constructor([key, options], opts) {
    const { limit, strategy, threshold, exactness = "~" } = options;
    super(["XTRIM", key, strategy, exactness, threshold, ...limit ? ["LIMIT", limit] : []], opts);
  }
};
var ZAddCommand = class extends Command {
  constructor([key, arg1, ...arg2], opts) {
    const command = ["zadd", key];
    if ("nx" in arg1 && arg1.nx) {
      command.push("nx");
    } else if ("xx" in arg1 && arg1.xx) {
      command.push("xx");
    }
    if ("ch" in arg1 && arg1.ch) {
      command.push("ch");
    }
    if ("incr" in arg1 && arg1.incr) {
      command.push("incr");
    }
    if ("lt" in arg1 && arg1.lt) {
      command.push("lt");
    } else if ("gt" in arg1 && arg1.gt) {
      command.push("gt");
    }
    if ("score" in arg1 && "member" in arg1) {
      command.push(arg1.score, arg1.member);
    }
    command.push(...arg2.flatMap(({ score, member }) => [score, member]));
    super(command, opts);
  }
};
var ZCardCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zcard", ...cmd], opts);
  }
};
var ZCountCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zcount", ...cmd], opts);
  }
};
var ZIncrByCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zincrby", ...cmd], opts);
  }
};
var ZInterStoreCommand = class extends Command {
  constructor([destination, numKeys, keyOrKeys, opts], cmdOpts) {
    const command = ["zinterstore", destination, numKeys];
    if (Array.isArray(keyOrKeys)) {
      command.push(...keyOrKeys);
    } else {
      command.push(keyOrKeys);
    }
    if (opts) {
      if ("weights" in opts && opts.weights) {
        command.push("weights", ...opts.weights);
      } else if ("weight" in opts && typeof opts.weight === "number") {
        command.push("weights", opts.weight);
      }
      if ("aggregate" in opts) {
        command.push("aggregate", opts.aggregate);
      }
    }
    super(command, cmdOpts);
  }
};
var ZLexCountCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zlexcount", ...cmd], opts);
  }
};
var ZPopMaxCommand = class extends Command {
  constructor([key, count], opts) {
    const command = ["zpopmax", key];
    if (typeof count === "number") {
      command.push(count);
    }
    super(command, opts);
  }
};
var ZPopMinCommand = class extends Command {
  constructor([key, count], opts) {
    const command = ["zpopmin", key];
    if (typeof count === "number") {
      command.push(count);
    }
    super(command, opts);
  }
};
var ZRangeCommand = class extends Command {
  constructor([key, min, max, opts], cmdOpts) {
    const command = ["zrange", key, min, max];
    if (opts?.byScore) {
      command.push("byscore");
    }
    if (opts?.byLex) {
      command.push("bylex");
    }
    if (opts?.rev) {
      command.push("rev");
    }
    if (opts?.count !== void 0 && opts.offset !== void 0) {
      command.push("limit", opts.offset, opts.count);
    }
    if (opts?.withScores) {
      command.push("withscores");
    }
    super(command, cmdOpts);
  }
};
var ZRankCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zrank", ...cmd], opts);
  }
};
var ZRemCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zrem", ...cmd], opts);
  }
};
var ZRemRangeByLexCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zremrangebylex", ...cmd], opts);
  }
};
var ZRemRangeByRankCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zremrangebyrank", ...cmd], opts);
  }
};
var ZRemRangeByScoreCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zremrangebyscore", ...cmd], opts);
  }
};
var ZRevRankCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zrevrank", ...cmd], opts);
  }
};
var ZScanCommand = class extends Command {
  constructor([key, cursor, opts], cmdOpts) {
    const command = ["zscan", key, cursor];
    if (opts?.match) {
      command.push("match", opts.match);
    }
    if (typeof opts?.count === "number") {
      command.push("count", opts.count);
    }
    super(command, {
      deserialize: deserializeScanResponse,
      ...cmdOpts
    });
  }
};
var ZScoreCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zscore", ...cmd], opts);
  }
};
var ZUnionCommand = class extends Command {
  constructor([numKeys, keyOrKeys, opts], cmdOpts) {
    const command = ["zunion", numKeys];
    if (Array.isArray(keyOrKeys)) {
      command.push(...keyOrKeys);
    } else {
      command.push(keyOrKeys);
    }
    if (opts) {
      if ("weights" in opts && opts.weights) {
        command.push("weights", ...opts.weights);
      } else if ("weight" in opts && typeof opts.weight === "number") {
        command.push("weights", opts.weight);
      }
      if ("aggregate" in opts) {
        command.push("aggregate", opts.aggregate);
      }
      if (opts.withScores) {
        command.push("withscores");
      }
    }
    super(command, cmdOpts);
  }
};
var ZUnionStoreCommand = class extends Command {
  constructor([destination, numKeys, keyOrKeys, opts], cmdOpts) {
    const command = ["zunionstore", destination, numKeys];
    if (Array.isArray(keyOrKeys)) {
      command.push(...keyOrKeys);
    } else {
      command.push(keyOrKeys);
    }
    if (opts) {
      if ("weights" in opts && opts.weights) {
        command.push("weights", ...opts.weights);
      } else if ("weight" in opts && typeof opts.weight === "number") {
        command.push("weights", opts.weight);
      }
      if ("aggregate" in opts) {
        command.push("aggregate", opts.aggregate);
      }
    }
    super(command, cmdOpts);
  }
};
var ZDiffStoreCommand = class extends Command {
  constructor(cmd, opts) {
    super(["zdiffstore", ...cmd], opts);
  }
};
var ZMScoreCommand = class extends Command {
  constructor(cmd, opts) {
    const [key, members] = cmd;
    super(["zmscore", key, ...members], opts);
  }
};
var Pipeline = class {
  client;
  commands;
  commandOptions;
  multiExec;
  constructor(opts) {
    this.client = opts.client;
    this.commands = [];
    this.commandOptions = opts.commandOptions;
    this.multiExec = opts.multiExec ?? false;
    if (this.commandOptions?.latencyLogging) {
      const originalExec = this.exec.bind(this);
      this.exec = async (options) => {
        const start = performance.now();
        const result = await (options ? originalExec(options) : originalExec());
        const end = performance.now();
        const loggerResult = (end - start).toFixed(2);
        console.log(
          `Latency for \x1B[38;2;19;185;39m${this.multiExec ? ["MULTI-EXEC"] : ["PIPELINE"].toString().toUpperCase()}\x1B[0m: \x1B[38;2;0;255;255m${loggerResult} ms\x1B[0m`
        );
        return result;
      };
    }
  }
  exec = async (options) => {
    if (this.commands.length === 0) {
      throw new Error("Pipeline is empty");
    }
    const path = this.multiExec ? ["multi-exec"] : ["pipeline"];
    const res = await this.client.request({
      path,
      body: Object.values(this.commands).map((c) => c.command)
    });
    return options?.keepErrors ? res.map(({ error, result }, i) => {
      return {
        error,
        result: this.commands[i].deserialize(result)
      };
    }) : res.map(({ error, result }, i) => {
      if (error) {
        throw new UpstashError(
          `Command ${i + 1} [ ${this.commands[i].command[0]} ] failed: ${error}`
        );
      }
      return this.commands[i].deserialize(result);
    });
  };
  /**
   * Returns the length of pipeline before the execution
   */
  length() {
    return this.commands.length;
  }
  /**
   * Pushes a command into the pipeline and returns a chainable instance of the
   * pipeline
   */
  chain(command) {
    this.commands.push(command);
    return this;
  }
  /**
   * @see https://redis.io/commands/append
   */
  append = (...args) => this.chain(new AppendCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/bitcount
   */
  bitcount = (...args) => this.chain(new BitCountCommand(args, this.commandOptions));
  /**
   * Returns an instance that can be used to execute `BITFIELD` commands on one key.
   *
   * @example
   * ```typescript
   * redis.set("mykey", 0);
   * const result = await redis.pipeline()
   *   .bitfield("mykey")
   *   .set("u4", 0, 16)
   *   .incr("u4", "#1", 1)
   *   .exec();
   * console.log(result); // [[0, 1]]
   * ```
   *
   * @see https://redis.io/commands/bitfield
   */
  bitfield = (...args) => new BitFieldCommand(args, this.client, this.commandOptions, this.chain.bind(this));
  /**
   * @see https://redis.io/commands/bitop
   */
  bitop = (op, destinationKey, sourceKey, ...sourceKeys) => this.chain(
    new BitOpCommand([op, destinationKey, sourceKey, ...sourceKeys], this.commandOptions)
  );
  /**
   * @see https://redis.io/commands/bitpos
   */
  bitpos = (...args) => this.chain(new BitPosCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/client-setinfo
   */
  clientSetinfo = (...args) => this.chain(new ClientSetInfoCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/copy
   */
  copy = (...args) => this.chain(new CopyCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zdiffstore
   */
  zdiffstore = (...args) => this.chain(new ZDiffStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/dbsize
   */
  dbsize = () => this.chain(new DBSizeCommand(this.commandOptions));
  /**
   * @see https://redis.io/commands/decr
   */
  decr = (...args) => this.chain(new DecrCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/decrby
   */
  decrby = (...args) => this.chain(new DecrByCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/del
   */
  del = (...args) => this.chain(new DelCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/echo
   */
  echo = (...args) => this.chain(new EchoCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/eval_ro
   */
  evalRo = (...args) => this.chain(new EvalROCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/eval
   */
  eval = (...args) => this.chain(new EvalCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/evalsha_ro
   */
  evalshaRo = (...args) => this.chain(new EvalshaROCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/evalsha
   */
  evalsha = (...args) => this.chain(new EvalshaCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/exists
   */
  exists = (...args) => this.chain(new ExistsCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/expire
   */
  expire = (...args) => this.chain(new ExpireCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/expireat
   */
  expireat = (...args) => this.chain(new ExpireAtCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/flushall
   */
  flushall = (args) => this.chain(new FlushAllCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/flushdb
   */
  flushdb = (...args) => this.chain(new FlushDBCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/geoadd
   */
  geoadd = (...args) => this.chain(new GeoAddCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/geodist
   */
  geodist = (...args) => this.chain(new GeoDistCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/geopos
   */
  geopos = (...args) => this.chain(new GeoPosCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/geohash
   */
  geohash = (...args) => this.chain(new GeoHashCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/geosearch
   */
  geosearch = (...args) => this.chain(new GeoSearchCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/geosearchstore
   */
  geosearchstore = (...args) => this.chain(new GeoSearchStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/get
   */
  get = (...args) => this.chain(new GetCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/getbit
   */
  getbit = (...args) => this.chain(new GetBitCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/getdel
   */
  getdel = (...args) => this.chain(new GetDelCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/getex
   */
  getex = (...args) => this.chain(new GetExCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/getrange
   */
  getrange = (...args) => this.chain(new GetRangeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/getset
   */
  getset = (key, value) => this.chain(new GetSetCommand([key, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/hdel
   */
  hdel = (...args) => this.chain(new HDelCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hexists
   */
  hexists = (...args) => this.chain(new HExistsCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hexpire
   */
  hexpire = (...args) => this.chain(new HExpireCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hexpireat
   */
  hexpireat = (...args) => this.chain(new HExpireAtCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hexpiretime
   */
  hexpiretime = (...args) => this.chain(new HExpireTimeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/httl
   */
  httl = (...args) => this.chain(new HTtlCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hpexpire
   */
  hpexpire = (...args) => this.chain(new HPExpireCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hpexpireat
   */
  hpexpireat = (...args) => this.chain(new HPExpireAtCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hpexpiretime
   */
  hpexpiretime = (...args) => this.chain(new HPExpireTimeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hpttl
   */
  hpttl = (...args) => this.chain(new HPTtlCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hpersist
   */
  hpersist = (...args) => this.chain(new HPersistCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hget
   */
  hget = (...args) => this.chain(new HGetCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hgetall
   */
  hgetall = (...args) => this.chain(new HGetAllCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hgetdel
   */
  hgetdel = (...args) => this.chain(new HGetDelCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hgetex
   */
  hgetex = (...args) => this.chain(new HGetExCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hincrby
   */
  hincrby = (...args) => this.chain(new HIncrByCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hincrbyfloat
   */
  hincrbyfloat = (...args) => this.chain(new HIncrByFloatCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hkeys
   */
  hkeys = (...args) => this.chain(new HKeysCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hlen
   */
  hlen = (...args) => this.chain(new HLenCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hmget
   */
  hmget = (...args) => this.chain(new HMGetCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hmset
   */
  hmset = (key, kv2) => this.chain(new HMSetCommand([key, kv2], this.commandOptions));
  /**
   * @see https://redis.io/commands/hrandfield
   */
  hrandfield = (key, count, withValues) => this.chain(new HRandFieldCommand([key, count, withValues], this.commandOptions));
  /**
   * @see https://redis.io/commands/hscan
   */
  hscan = (...args) => this.chain(new HScanCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hset
   */
  hset = (key, kv2) => this.chain(new HSetCommand([key, kv2], this.commandOptions));
  /**
   * @see https://redis.io/commands/hsetex
   */
  hsetex = (...args) => this.chain(new HSetExCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hsetnx
   */
  hsetnx = (key, field, value) => this.chain(new HSetNXCommand([key, field, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/hstrlen
   */
  hstrlen = (...args) => this.chain(new HStrLenCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/hvals
   */
  hvals = (...args) => this.chain(new HValsCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/incr
   */
  incr = (...args) => this.chain(new IncrCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/incrby
   */
  incrby = (...args) => this.chain(new IncrByCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/incrbyfloat
   */
  incrbyfloat = (...args) => this.chain(new IncrByFloatCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/keys
   */
  keys = (...args) => this.chain(new KeysCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lindex
   */
  lindex = (...args) => this.chain(new LIndexCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/linsert
   */
  linsert = (key, direction, pivot, value) => this.chain(new LInsertCommand([key, direction, pivot, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/llen
   */
  llen = (...args) => this.chain(new LLenCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lmove
   */
  lmove = (...args) => this.chain(new LMoveCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lpop
   */
  lpop = (...args) => this.chain(new LPopCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lmpop
   */
  lmpop = (...args) => this.chain(new LmPopCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lpos
   */
  lpos = (...args) => this.chain(new LPosCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lpush
   */
  lpush = (key, ...elements) => this.chain(new LPushCommand([key, ...elements], this.commandOptions));
  /**
   * @see https://redis.io/commands/lpushx
   */
  lpushx = (key, ...elements) => this.chain(new LPushXCommand([key, ...elements], this.commandOptions));
  /**
   * @see https://redis.io/commands/lrange
   */
  lrange = (...args) => this.chain(new LRangeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/lrem
   */
  lrem = (key, count, value) => this.chain(new LRemCommand([key, count, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/lset
   */
  lset = (key, index, value) => this.chain(new LSetCommand([key, index, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/ltrim
   */
  ltrim = (...args) => this.chain(new LTrimCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/mget
   */
  mget = (...args) => this.chain(new MGetCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/mset
   */
  mset = (kv2) => this.chain(new MSetCommand([kv2], this.commandOptions));
  /**
   * @see https://redis.io/commands/msetnx
   */
  msetnx = (kv2) => this.chain(new MSetNXCommand([kv2], this.commandOptions));
  /**
   * @see https://redis.io/commands/persist
   */
  persist = (...args) => this.chain(new PersistCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/pexpire
   */
  pexpire = (...args) => this.chain(new PExpireCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/pexpireat
   */
  pexpireat = (...args) => this.chain(new PExpireAtCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/pfadd
   */
  pfadd = (...args) => this.chain(new PfAddCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/pfcount
   */
  pfcount = (...args) => this.chain(new PfCountCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/pfmerge
   */
  pfmerge = (...args) => this.chain(new PfMergeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/ping
   */
  ping = (args) => this.chain(new PingCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/psetex
   */
  psetex = (key, ttl, value) => this.chain(new PSetEXCommand([key, ttl, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/pttl
   */
  pttl = (...args) => this.chain(new PTtlCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/publish
   */
  publish = (...args) => this.chain(new PublishCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/randomkey
   */
  randomkey = () => this.chain(new RandomKeyCommand(this.commandOptions));
  /**
   * @see https://redis.io/commands/rename
   */
  rename = (...args) => this.chain(new RenameCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/renamenx
   */
  renamenx = (...args) => this.chain(new RenameNXCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/rpop
   */
  rpop = (...args) => this.chain(new RPopCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/rpush
   */
  rpush = (key, ...elements) => this.chain(new RPushCommand([key, ...elements], this.commandOptions));
  /**
   * @see https://redis.io/commands/rpushx
   */
  rpushx = (key, ...elements) => this.chain(new RPushXCommand([key, ...elements], this.commandOptions));
  /**
   * @see https://redis.io/commands/sadd
   */
  sadd = (key, member, ...members) => this.chain(new SAddCommand([key, member, ...members], this.commandOptions));
  /**
   * @see https://redis.io/commands/scan
   */
  scan = (...args) => this.chain(new ScanCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/scard
   */
  scard = (...args) => this.chain(new SCardCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/script-exists
   */
  scriptExists = (...args) => this.chain(new ScriptExistsCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/script-flush
   */
  scriptFlush = (...args) => this.chain(new ScriptFlushCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/script-load
   */
  scriptLoad = (...args) => this.chain(new ScriptLoadCommand(args, this.commandOptions));
  /*)*
   * @see https://redis.io/commands/sdiff
   */
  sdiff = (...args) => this.chain(new SDiffCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sdiffstore
   */
  sdiffstore = (...args) => this.chain(new SDiffStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/set
   */
  set = (key, value, opts) => this.chain(new SetCommand([key, value, opts], this.commandOptions));
  /**
   * @see https://redis.io/commands/setbit
   */
  setbit = (...args) => this.chain(new SetBitCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/setex
   */
  setex = (key, ttl, value) => this.chain(new SetExCommand([key, ttl, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/setnx
   */
  setnx = (key, value) => this.chain(new SetNxCommand([key, value], this.commandOptions));
  /**
   * @see https://redis.io/commands/setrange
   */
  setrange = (...args) => this.chain(new SetRangeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sinter
   */
  sinter = (...args) => this.chain(new SInterCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sintercard
   */
  sintercard = (...args) => this.chain(new SInterCardCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sinterstore
   */
  sinterstore = (...args) => this.chain(new SInterStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sismember
   */
  sismember = (key, member) => this.chain(new SIsMemberCommand([key, member], this.commandOptions));
  /**
   * @see https://redis.io/commands/smembers
   */
  smembers = (...args) => this.chain(new SMembersCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/smismember
   */
  smismember = (key, members) => this.chain(new SMIsMemberCommand([key, members], this.commandOptions));
  /**
   * @see https://redis.io/commands/smove
   */
  smove = (source, destination, member) => this.chain(new SMoveCommand([source, destination, member], this.commandOptions));
  /**
   * @see https://redis.io/commands/spop
   */
  spop = (...args) => this.chain(new SPopCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/srandmember
   */
  srandmember = (...args) => this.chain(new SRandMemberCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/srem
   */
  srem = (key, ...members) => this.chain(new SRemCommand([key, ...members], this.commandOptions));
  /**
   * @see https://redis.io/commands/sscan
   */
  sscan = (...args) => this.chain(new SScanCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/strlen
   */
  strlen = (...args) => this.chain(new StrLenCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sunion
   */
  sunion = (...args) => this.chain(new SUnionCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/sunionstore
   */
  sunionstore = (...args) => this.chain(new SUnionStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/time
   */
  time = () => this.chain(new TimeCommand(this.commandOptions));
  /**
   * @see https://redis.io/commands/touch
   */
  touch = (...args) => this.chain(new TouchCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/ttl
   */
  ttl = (...args) => this.chain(new TtlCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/type
   */
  type = (...args) => this.chain(new TypeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/unlink
   */
  unlink = (...args) => this.chain(new UnlinkCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zadd
   */
  zadd = (...args) => {
    if ("score" in args[1]) {
      return this.chain(
        new ZAddCommand([args[0], args[1], ...args.slice(2)], this.commandOptions)
      );
    }
    return this.chain(
      new ZAddCommand(
        [args[0], args[1], ...args.slice(2)],
        this.commandOptions
      )
    );
  };
  /**
   * @see https://redis.io/commands/xadd
   */
  xadd = (...args) => this.chain(new XAddCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xack
   */
  xack = (...args) => this.chain(new XAckCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xackdel
   */
  xackdel = (...args) => this.chain(new XAckDelCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xdel
   */
  xdel = (...args) => this.chain(new XDelCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xdelex
   */
  xdelex = (...args) => this.chain(new XDelExCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xgroup
   */
  xgroup = (...args) => this.chain(new XGroupCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xread
   */
  xread = (...args) => this.chain(new XReadCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xreadgroup
   */
  xreadgroup = (...args) => this.chain(new XReadGroupCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xinfo
   */
  xinfo = (...args) => this.chain(new XInfoCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xlen
   */
  xlen = (...args) => this.chain(new XLenCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xpending
   */
  xpending = (...args) => this.chain(new XPendingCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xclaim
   */
  xclaim = (...args) => this.chain(new XClaimCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xautoclaim
   */
  xautoclaim = (...args) => this.chain(new XAutoClaim(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xtrim
   */
  xtrim = (...args) => this.chain(new XTrimCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xrange
   */
  xrange = (...args) => this.chain(new XRangeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/xrevrange
   */
  xrevrange = (...args) => this.chain(new XRevRangeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zcard
   */
  zcard = (...args) => this.chain(new ZCardCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zcount
   */
  zcount = (...args) => this.chain(new ZCountCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zincrby
   */
  zincrby = (key, increment, member) => this.chain(new ZIncrByCommand([key, increment, member], this.commandOptions));
  /**
   * @see https://redis.io/commands/zinterstore
   */
  zinterstore = (...args) => this.chain(new ZInterStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zlexcount
   */
  zlexcount = (...args) => this.chain(new ZLexCountCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zmscore
   */
  zmscore = (...args) => this.chain(new ZMScoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zpopmax
   */
  zpopmax = (...args) => this.chain(new ZPopMaxCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zpopmin
   */
  zpopmin = (...args) => this.chain(new ZPopMinCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zrange
   */
  zrange = (...args) => this.chain(new ZRangeCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zrank
   */
  zrank = (key, member) => this.chain(new ZRankCommand([key, member], this.commandOptions));
  /**
   * @see https://redis.io/commands/zrem
   */
  zrem = (key, ...members) => this.chain(new ZRemCommand([key, ...members], this.commandOptions));
  /**
   * @see https://redis.io/commands/zremrangebylex
   */
  zremrangebylex = (...args) => this.chain(new ZRemRangeByLexCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zremrangebyrank
   */
  zremrangebyrank = (...args) => this.chain(new ZRemRangeByRankCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zremrangebyscore
   */
  zremrangebyscore = (...args) => this.chain(new ZRemRangeByScoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zrevrank
   */
  zrevrank = (key, member) => this.chain(new ZRevRankCommand([key, member], this.commandOptions));
  /**
   * @see https://redis.io/commands/zscan
   */
  zscan = (...args) => this.chain(new ZScanCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zscore
   */
  zscore = (key, member) => this.chain(new ZScoreCommand([key, member], this.commandOptions));
  /**
   * @see https://redis.io/commands/zunionstore
   */
  zunionstore = (...args) => this.chain(new ZUnionStoreCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/zunion
   */
  zunion = (...args) => this.chain(new ZUnionCommand(args, this.commandOptions));
  /**
   * @see https://redis.io/commands/?group=json
   */
  get json() {
    return {
      /**
       * @see https://redis.io/commands/json.arrappend
       */
      arrappend: (...args) => this.chain(new JsonArrAppendCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.arrindex
       */
      arrindex: (...args) => this.chain(new JsonArrIndexCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.arrinsert
       */
      arrinsert: (...args) => this.chain(new JsonArrInsertCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.arrlen
       */
      arrlen: (...args) => this.chain(new JsonArrLenCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.arrpop
       */
      arrpop: (...args) => this.chain(new JsonArrPopCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.arrtrim
       */
      arrtrim: (...args) => this.chain(new JsonArrTrimCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.clear
       */
      clear: (...args) => this.chain(new JsonClearCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.del
       */
      del: (...args) => this.chain(new JsonDelCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.forget
       */
      forget: (...args) => this.chain(new JsonForgetCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.get
       */
      get: (...args) => this.chain(new JsonGetCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.merge
       */
      merge: (...args) => this.chain(new JsonMergeCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.mget
       */
      mget: (...args) => this.chain(new JsonMGetCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.mset
       */
      mset: (...args) => this.chain(new JsonMSetCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.numincrby
       */
      numincrby: (...args) => this.chain(new JsonNumIncrByCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.nummultby
       */
      nummultby: (...args) => this.chain(new JsonNumMultByCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.objkeys
       */
      objkeys: (...args) => this.chain(new JsonObjKeysCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.objlen
       */
      objlen: (...args) => this.chain(new JsonObjLenCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.resp
       */
      resp: (...args) => this.chain(new JsonRespCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.set
       */
      set: (...args) => this.chain(new JsonSetCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.strappend
       */
      strappend: (...args) => this.chain(new JsonStrAppendCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.strlen
       */
      strlen: (...args) => this.chain(new JsonStrLenCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.toggle
       */
      toggle: (...args) => this.chain(new JsonToggleCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/commands/json.type
       */
      type: (...args) => this.chain(new JsonTypeCommand(args, this.commandOptions))
    };
  }
  get functions() {
    return {
      /**
       * @see https://redis.io/docs/latest/commands/function-load/
       */
      load: (...args) => this.chain(new FunctionLoadCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/docs/latest/commands/function-list/
       */
      list: (...args) => this.chain(new FunctionListCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/docs/latest/commands/function-delete/
       */
      delete: (...args) => this.chain(new FunctionDeleteCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/docs/latest/commands/function-flush/
       */
      flush: () => this.chain(new FunctionFlushCommand(this.commandOptions)),
      /**
       * @see https://redis.io/docs/latest/commands/function-stats/
       */
      stats: () => this.chain(new FunctionStatsCommand(this.commandOptions)),
      /**
       * @see https://redis.io/docs/latest/commands/fcall/
       */
      call: (...args) => this.chain(new FCallCommand(args, this.commandOptions)),
      /**
       * @see https://redis.io/docs/latest/commands/fcall_ro/
       */
      callRo: (...args) => this.chain(new FCallRoCommand(args, this.commandOptions))
    };
  }
};
var MAX_PIPELINE_SIZE = 1e3;
var READ_COMMANDS = /* @__PURE__ */ new Set([
  // String
  "get",
  "getrange",
  "mget",
  "strlen",
  // Bit
  "bitcount",
  "bitpos",
  "getbit",
  // Hash
  "hexists",
  "hget",
  "hgetall",
  "hkeys",
  "hlen",
  "hmget",
  "hrandfield",
  "hscan",
  "hstrlen",
  "httl",
  "hvals",
  "hexpiretime",
  "hpexpiretime",
  "hpttl",
  // List
  "lindex",
  "llen",
  "lpos",
  "lrange",
  // Set
  "scard",
  "sdiff",
  "sinter",
  "sintercard",
  "sismember",
  "smembers",
  "smismember",
  "srandmember",
  "sscan",
  "sunion",
  // Sorted set
  "zcard",
  "zcount",
  "zlexcount",
  "zmscore",
  "zrange",
  "zrank",
  "zrevrank",
  "zscan",
  "zscore",
  "zunion",
  // Key metadata
  "exists",
  "type",
  "ttl",
  "pttl",
  "randomkey",
  "touch",
  // HyperLogLog
  "pfcount",
  // Stream
  "xinfo",
  "xlen",
  "xpending",
  "xrange",
  "xread",
  "xrevrange",
  // Geo
  "geodist",
  "geohash",
  "geopos",
  "geosearch",
  // Script / eval
  "scriptExists",
  "evalRo",
  "evalshaRo",
  // Utility
  "dbsize",
  "echo",
  "ping",
  "time",
  "scan",
  "keys",
  // JSON namespace
  "arrindex",
  "arrlen",
  "objkeys",
  "objlen",
  "resp",
  // Functions namespace
  "list",
  "stats",
  "callRo"
]);
var EXCLUDE_COMMANDS = /* @__PURE__ */ new Set([
  "scan",
  "keys",
  "flushdb",
  "flushall",
  "dbsize",
  "hscan",
  "hgetall",
  "hkeys",
  "lrange",
  "sscan",
  "smembers",
  "xrange",
  "xrevrange",
  "zscan",
  "zrange",
  "exec"
]);
function createAutoPipelineProxy(_redis, namespace = "root") {
  const redis = _redis;
  if (!redis.autoPipelineExecutor) {
    redis.autoPipelineExecutor = new AutoPipelineExecutor(redis);
  }
  return new Proxy(redis, {
    get: (redis2, command) => {
      if (command === "pipelineCounter") {
        return redis2.autoPipelineExecutor.pipelineCounter;
      }
      if (namespace === "root" && command === "json") {
        return createAutoPipelineProxy(redis2, "json");
      }
      if (namespace === "root" && command === "functions") {
        return createAutoPipelineProxy(redis2, "functions");
      }
      if (namespace === "root") {
        const commandInRedisButNotPipeline = command in redis2 && !(command in redis2.autoPipelineExecutor.pipeline);
        const isCommandExcluded = EXCLUDE_COMMANDS.has(command);
        if (commandInRedisButNotPipeline || isCommandExcluded) {
          return redis2[command];
        }
      }
      const pipeline = redis2.autoPipelineExecutor.pipeline;
      const targetFunction = namespace === "json" ? pipeline.json[command] : namespace === "functions" ? pipeline.functions[command] : pipeline[command];
      const isFunction = typeof targetFunction === "function";
      if (isFunction) {
        return (...args) => {
          const commandMode = READ_COMMANDS.has(command) ? "read" : "write";
          return redis2.autoPipelineExecutor.withAutoPipeline(commandMode, (pipeline2) => {
            const targetFunction2 = namespace === "json" ? pipeline2.json[command] : namespace === "functions" ? pipeline2.functions[command] : pipeline2[command];
            targetFunction2(...args);
          });
        };
      }
      return targetFunction;
    }
  });
}
var AutoPipelineExecutor = class {
  pipelinePromises = /* @__PURE__ */ new WeakMap();
  activeReadPipeline = null;
  activeWritePipeline = null;
  readIndex = 0;
  writeIndex = 0;
  redis;
  pipeline;
  // only to make sure that proxy can work
  pipelineCounter = 0;
  // to keep track of how many times a pipeline was executed
  constructor(redis) {
    this.redis = redis;
    this.pipeline = redis.pipeline();
  }
  async withAutoPipeline(commandMode, executeWithPipeline) {
    const isRead = commandMode === "read";
    const activePipeline = isRead ? this.activeReadPipeline : this.activeWritePipeline;
    const pipeline = activePipeline ?? this.redis.pipeline();
    if (!activePipeline) {
      if (isRead) {
        this.activeReadPipeline = pipeline;
        this.readIndex = 0;
      } else {
        this.activeWritePipeline = pipeline;
        this.writeIndex = 0;
      }
    }
    const index = isRead ? this.readIndex++ : this.writeIndex++;
    executeWithPipeline(pipeline);
    if (isRead && this.readIndex >= MAX_PIPELINE_SIZE) {
      this.activeReadPipeline = null;
    } else if (!isRead && this.writeIndex >= MAX_PIPELINE_SIZE) {
      this.activeWritePipeline = null;
    }
    const pipelineDone = this.deferExecution().then(() => {
      if (!this.pipelinePromises.has(pipeline)) {
        const pipelinePromise = pipeline.exec({ keepErrors: true });
        this.pipelineCounter += 1;
        this.pipelinePromises.set(pipeline, pipelinePromise);
        if (this.activeReadPipeline === pipeline) {
          this.activeReadPipeline = null;
        }
        if (this.activeWritePipeline === pipeline) {
          this.activeWritePipeline = null;
        }
      }
      return this.pipelinePromises.get(pipeline);
    });
    const results = await pipelineDone;
    const commandResult = results[index];
    if (commandResult.error) {
      throw new UpstashError(`Command failed: ${commandResult.error}`);
    }
    return commandResult.result;
  }
  async deferExecution() {
    await Promise.resolve();
    await Promise.resolve();
  }
};
var PSubscribeCommand = class extends Command {
  constructor(cmd, opts) {
    const sseHeaders = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    };
    super([], {
      ...opts,
      headers: sseHeaders,
      path: ["psubscribe", ...cmd],
      streamOptions: {
        isStreaming: true,
        onMessage: opts?.streamOptions?.onMessage,
        signal: opts?.streamOptions?.signal
      }
    });
  }
};
var Subscriber = class extends EventTarget {
  subscriptions;
  client;
  listeners;
  opts;
  constructor(client2, channels, isPattern = false, opts) {
    super();
    this.client = client2;
    this.subscriptions = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
    this.opts = opts;
    for (const channel of channels) {
      if (isPattern) {
        this.subscribeToPattern(channel);
      } else {
        this.subscribeToChannel(channel);
      }
    }
  }
  subscribeToChannel(channel) {
    const controller = new AbortController();
    const command = new SubscribeCommand([channel], {
      streamOptions: {
        signal: controller.signal,
        onMessage: (data) => this.handleMessage(data, false)
      }
    });
    command.exec(this.client).catch((error) => {
      if (error.name !== "AbortError") {
        this.dispatchToListeners("error", error);
      }
    });
    this.subscriptions.set(channel, {
      command,
      controller,
      isPattern: false
    });
  }
  subscribeToPattern(pattern) {
    const controller = new AbortController();
    const command = new PSubscribeCommand([pattern], {
      streamOptions: {
        signal: controller.signal,
        onMessage: (data) => this.handleMessage(data, true)
      }
    });
    command.exec(this.client).catch((error) => {
      if (error.name !== "AbortError") {
        this.dispatchToListeners("error", error);
      }
    });
    this.subscriptions.set(pattern, {
      command,
      controller,
      isPattern: true
    });
  }
  handleMessage(data, isPattern) {
    const messageData = data.replace(/^data:\s*/, "");
    const firstCommaIndex = messageData.indexOf(",");
    const secondCommaIndex = messageData.indexOf(",", firstCommaIndex + 1);
    const thirdCommaIndex = isPattern ? messageData.indexOf(",", secondCommaIndex + 1) : -1;
    if (firstCommaIndex !== -1 && secondCommaIndex !== -1) {
      const type = messageData.slice(0, firstCommaIndex);
      if (isPattern && type === "pmessage" && thirdCommaIndex !== -1) {
        const pattern = messageData.slice(firstCommaIndex + 1, secondCommaIndex);
        const channel = messageData.slice(secondCommaIndex + 1, thirdCommaIndex);
        const messageStr = messageData.slice(thirdCommaIndex + 1);
        try {
          const message = this.opts?.automaticDeserialization === false ? messageStr : JSON.parse(messageStr);
          this.dispatchToListeners("pmessage", { pattern, channel, message });
          this.dispatchToListeners(`pmessage:${pattern}`, { pattern, channel, message });
        } catch (error) {
          this.dispatchToListeners("error", new Error(`Failed to parse message: ${error}`));
        }
      } else {
        const channel = messageData.slice(firstCommaIndex + 1, secondCommaIndex);
        const messageStr = messageData.slice(secondCommaIndex + 1);
        try {
          if (type === "subscribe" || type === "psubscribe" || type === "unsubscribe" || type === "punsubscribe") {
            const count = Number.parseInt(messageStr);
            this.dispatchToListeners(type, count);
          } else {
            const message = this.opts?.automaticDeserialization === false ? messageStr : parseWithTryCatch(messageStr);
            this.dispatchToListeners(type, { channel, message });
            this.dispatchToListeners(`${type}:${channel}`, { channel, message });
          }
        } catch (error) {
          this.dispatchToListeners("error", new Error(`Failed to parse message: ${error}`));
        }
      }
    }
  }
  dispatchToListeners(type, data) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }
  on(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, /* @__PURE__ */ new Set());
    }
    this.listeners.get(type)?.add(listener);
  }
  removeAllListeners() {
    this.listeners.clear();
  }
  async unsubscribe(channels) {
    if (channels) {
      for (const channel of channels) {
        const subscription = this.subscriptions.get(channel);
        if (subscription) {
          try {
            subscription.controller.abort();
          } catch {
          }
          this.subscriptions.delete(channel);
        }
      }
    } else {
      for (const subscription of this.subscriptions.values()) {
        try {
          subscription.controller.abort();
        } catch {
        }
      }
      this.subscriptions.clear();
      this.removeAllListeners();
    }
  }
  getSubscribedChannels() {
    return [...this.subscriptions.keys()];
  }
};
var SubscribeCommand = class extends Command {
  constructor(cmd, opts) {
    const sseHeaders = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    };
    super([], {
      ...opts,
      headers: sseHeaders,
      path: ["subscribe", ...cmd],
      streamOptions: {
        isStreaming: true,
        onMessage: opts?.streamOptions?.onMessage,
        signal: opts?.streamOptions?.signal
      }
    });
  }
};
var parseWithTryCatch = (str) => {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
};
var Script = class {
  script;
  /**
   * @deprecated This property is initialized to an empty string and will be set in the init method
   * asynchronously. Do not use this property immidiately after the constructor.
   *
   * This property is only exposed for backwards compatibility and will be removed in the
   * future major release.
   */
  sha1;
  initPromise;
  redis;
  constructor(redis, script) {
    this.redis = redis;
    this.script = script;
    this.sha1 = "";
    void this.init(script);
  }
  /**
   * Initialize the script by computing its SHA-1 hash.
   */
  init(script) {
    if (!this.initPromise) {
      this.initPromise = this.digest(script).then((sha1) => {
        this.sha1 = sha1;
      });
    }
    return this.initPromise;
  }
  /**
   * Send an `EVAL` command to redis.
   */
  async eval(keys, args) {
    await this.init(this.script);
    return await this.redis.eval(this.script, keys, args);
  }
  /**
   * Calculates the sha1 hash of the script and then calls `EVALSHA`.
   */
  async evalsha(keys, args) {
    await this.init(this.script);
    return await this.redis.evalsha(this.sha1, keys, args);
  }
  /**
   * Optimistically try to run `EVALSHA` first.
   * If the script is not loaded in redis, it will fall back and try again with `EVAL`.
   *
   * Following calls will be able to use the cached script
   */
  async exec(keys, args) {
    await this.init(this.script);
    const res = await this.redis.evalsha(this.sha1, keys, args).catch(async (error) => {
      if (error instanceof Error && error.message.toLowerCase().includes("noscript")) {
        return await this.redis.eval(this.script, keys, args);
      }
      throw error;
    });
    return res;
  }
  /**
   * Compute the sha1 hash of the script and return its hex representation.
   */
  async digest(s) {
    const data = new TextEncoder().encode(s);
    const hashBuffer = await subtle.digest("SHA-1", data);
    const hashArray = [...new Uint8Array(hashBuffer)];
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
};
var ScriptRO = class {
  script;
  /**
   * @deprecated This property is initialized to an empty string and will be set in the init method
   * asynchronously. Do not use this property immidiately after the constructor.
   *
   * This property is only exposed for backwards compatibility and will be removed in the
   * future major release.
   */
  sha1;
  initPromise;
  redis;
  constructor(redis, script) {
    this.redis = redis;
    this.sha1 = "";
    this.script = script;
    void this.init(script);
  }
  init(script) {
    if (!this.initPromise) {
      this.initPromise = this.digest(script).then((sha1) => {
        this.sha1 = sha1;
      });
    }
    return this.initPromise;
  }
  /**
   * Send an `EVAL_RO` command to redis.
   */
  async evalRo(keys, args) {
    await this.init(this.script);
    return await this.redis.evalRo(this.script, keys, args);
  }
  /**
   * Calculates the sha1 hash of the script and then calls `EVALSHA_RO`.
   */
  async evalshaRo(keys, args) {
    await this.init(this.script);
    return await this.redis.evalshaRo(this.sha1, keys, args);
  }
  /**
   * Optimistically try to run `EVALSHA_RO` first.
   * If the script is not loaded in redis, it will fall back and try again with `EVAL_RO`.
   *
   * Following calls will be able to use the cached script
   */
  async exec(keys, args) {
    await this.init(this.script);
    const res = await this.redis.evalshaRo(this.sha1, keys, args).catch(async (error) => {
      if (error instanceof Error && error.message.toLowerCase().includes("noscript")) {
        return await this.redis.evalRo(this.script, keys, args);
      }
      throw error;
    });
    return res;
  }
  /**
   * Compute the sha1 hash of the script and return its hex representation.
   */
  async digest(s) {
    const data = new TextEncoder().encode(s);
    const hashBuffer = await subtle.digest("SHA-1", data);
    const hashArray = [...new Uint8Array(hashBuffer)];
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
};
var Redis = class {
  client;
  opts;
  enableTelemetry;
  enableAutoPipelining;
  /**
   * Create a new redis client
   *
   * @example
   * ```typescript
   * const redis = new Redis({
   *  url: "<UPSTASH_REDIS_REST_URL>",
   *  token: "<UPSTASH_REDIS_REST_TOKEN>",
   * });
   * ```
   */
  constructor(client2, opts) {
    this.client = client2;
    this.opts = opts;
    this.enableTelemetry = opts?.enableTelemetry ?? true;
    if (opts?.readYourWrites === false) {
      this.client.readYourWrites = false;
    }
    this.enableAutoPipelining = opts?.enableAutoPipelining ?? true;
  }
  get readYourWritesSyncToken() {
    return this.client.upstashSyncToken;
  }
  set readYourWritesSyncToken(session) {
    this.client.upstashSyncToken = session;
  }
  get json() {
    return {
      /**
       * @see https://redis.io/commands/json.arrappend
       */
      arrappend: (...args) => new JsonArrAppendCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.arrindex
       */
      arrindex: (...args) => new JsonArrIndexCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.arrinsert
       */
      arrinsert: (...args) => new JsonArrInsertCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.arrlen
       */
      arrlen: (...args) => new JsonArrLenCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.arrpop
       */
      arrpop: (...args) => new JsonArrPopCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.arrtrim
       */
      arrtrim: (...args) => new JsonArrTrimCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.clear
       */
      clear: (...args) => new JsonClearCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.del
       */
      del: (...args) => new JsonDelCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.forget
       */
      forget: (...args) => new JsonForgetCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.get
       */
      get: (...args) => new JsonGetCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.merge
       */
      merge: (...args) => new JsonMergeCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.mget
       */
      mget: (...args) => new JsonMGetCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.mset
       */
      mset: (...args) => new JsonMSetCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.numincrby
       */
      numincrby: (...args) => new JsonNumIncrByCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.nummultby
       */
      nummultby: (...args) => new JsonNumMultByCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.objkeys
       */
      objkeys: (...args) => new JsonObjKeysCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.objlen
       */
      objlen: (...args) => new JsonObjLenCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.resp
       */
      resp: (...args) => new JsonRespCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.set
       */
      set: (...args) => new JsonSetCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.strappend
       */
      strappend: (...args) => new JsonStrAppendCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.strlen
       */
      strlen: (...args) => new JsonStrLenCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.toggle
       */
      toggle: (...args) => new JsonToggleCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/commands/json.type
       */
      type: (...args) => new JsonTypeCommand(args, this.opts).exec(this.client)
    };
  }
  get functions() {
    return {
      /**
       * @see https://redis.io/docs/latest/commands/function-load/
       */
      load: (...args) => new FunctionLoadCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/docs/latest/commands/function-list/
       */
      list: (...args) => new FunctionListCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/docs/latest/commands/function-delete/
       */
      delete: (...args) => new FunctionDeleteCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/docs/latest/commands/function-flush/
       */
      flush: () => new FunctionFlushCommand(this.opts).exec(this.client),
      /**
       * @see https://redis.io/docs/latest/commands/function-stats/
       *
       * Note: `running_script` field is not supported and therefore not included in the type.
       */
      stats: () => new FunctionStatsCommand(this.opts).exec(this.client),
      /**
       * @see https://redis.io/docs/latest/commands/fcall/
       */
      call: (...args) => new FCallCommand(args, this.opts).exec(this.client),
      /**
       * @see https://redis.io/docs/latest/commands/fcall_ro/
       */
      callRo: (...args) => new FCallRoCommand(args, this.opts).exec(this.client)
    };
  }
  /**
   * Wrap a new middleware around the HTTP client.
   */
  use = (middleware) => {
    const makeRequest = this.client.request.bind(this.client);
    this.client.request = (req) => middleware(req, makeRequest);
  };
  /**
   * Technically this is not private, we can hide it from intellisense by doing this
   */
  addTelemetry = (telemetry) => {
    if (!this.enableTelemetry) {
      return;
    }
    try {
      this.client.mergeTelemetry(telemetry);
    } catch {
    }
  };
  /**
   * Creates a new script.
   *
   * Scripts offer the ability to optimistically try to execute a script without having to send the
   * entire script to the server. If the script is loaded on the server, it tries again by sending
   * the entire script. Afterwards, the script is cached on the server.
   *
   * @param script - The script to create
   * @param opts - Optional options to pass to the script `{ readonly?: boolean }`
   * @returns A new script
   *
   * @example
   * ```ts
   * const redis = new Redis({...})
   *
   * const script = redis.createScript<string>("return ARGV[1];")
   * const arg1 = await script.eval([], ["Hello World"])
   * expect(arg1, "Hello World")
   * ```
   * @example
   * ```ts
   * const redis = new Redis({...})
   *
   * const script = redis.createScript<string>("return ARGV[1];", { readonly: true })
   * const arg1 = await script.evalRo([], ["Hello World"])
   * expect(arg1, "Hello World")
   * ```
   */
  createScript(script, opts) {
    return opts?.readonly ? new ScriptRO(this, script) : new Script(this, script);
  }
  get search() {
    return {
      createIndex: (params) => {
        return createIndex(this.client, params);
      },
      index: (params) => {
        return initIndex(this.client, params);
      },
      alias: {
        list: () => {
          return listAliases(this.client);
        },
        add: ({ indexName, alias }) => {
          return addAlias(this.client, { indexName, alias });
        },
        delete: ({ alias }) => {
          return delAlias(this.client, { alias });
        }
      }
    };
  }
  /**
   * Create a new pipeline that allows you to send requests in bulk.
   *
   * @see {@link Pipeline}
   */
  pipeline = () => new Pipeline({
    client: this.client,
    commandOptions: this.opts,
    multiExec: false
  });
  autoPipeline = () => {
    return createAutoPipelineProxy(this);
  };
  /**
   * Create a new transaction to allow executing multiple steps atomically.
   *
   * All the commands in a transaction are serialized and executed sequentially. A request sent by
   * another client will never be served in the middle of the execution of a Redis Transaction. This
   * guarantees that the commands are executed as a single isolated operation.
   *
   * @see {@link Pipeline}
   */
  multi = () => new Pipeline({
    client: this.client,
    commandOptions: this.opts,
    multiExec: true
  });
  /**
   * Returns an instance that can be used to execute `BITFIELD` commands on one key.
   *
   * @example
   * ```typescript
   * redis.set("mykey", 0);
   * const result = await redis.bitfield("mykey")
   *   .set("u4", 0, 16)
   *   .incr("u4", "#1", 1)
   *   .exec();
   * console.log(result); // [0, 1]
   * ```
   *
   * @see https://redis.io/commands/bitfield
   */
  bitfield = (...args) => new BitFieldCommand(args, this.client, this.opts);
  /**
   * @see https://redis.io/commands/append
   */
  append = (...args) => new AppendCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/bitcount
   */
  bitcount = (...args) => new BitCountCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/bitop
   */
  bitop = (op, destinationKey, sourceKey, ...sourceKeys) => new BitOpCommand([op, destinationKey, sourceKey, ...sourceKeys], this.opts).exec(
    this.client
  );
  /**
   * @see https://redis.io/commands/bitpos
   */
  bitpos = (...args) => new BitPosCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/client-setinfo
   */
  clientSetinfo = (...args) => new ClientSetInfoCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/copy
   */
  copy = (...args) => new CopyCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/dbsize
   */
  dbsize = () => new DBSizeCommand(this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/decr
   */
  decr = (...args) => new DecrCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/decrby
   */
  decrby = (...args) => new DecrByCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/del
   */
  del = (...args) => new DelCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/echo
   */
  echo = (...args) => new EchoCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/eval_ro
   */
  evalRo = (...args) => new EvalROCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/eval
   */
  eval = (...args) => new EvalCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/evalsha_ro
   */
  evalshaRo = (...args) => new EvalshaROCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/evalsha
   */
  evalsha = (...args) => new EvalshaCommand(args, this.opts).exec(this.client);
  /**
   * Generic method to execute any Redis command.
   */
  exec = (args) => new ExecCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/exists
   */
  exists = (...args) => new ExistsCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/expire
   */
  expire = (...args) => new ExpireCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/expireat
   */
  expireat = (...args) => new ExpireAtCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/flushall
   */
  flushall = (args) => new FlushAllCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/flushdb
   */
  flushdb = (...args) => new FlushDBCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/geoadd
   */
  geoadd = (...args) => new GeoAddCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/geopos
   */
  geopos = (...args) => new GeoPosCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/geodist
   */
  geodist = (...args) => new GeoDistCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/geohash
   */
  geohash = (...args) => new GeoHashCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/geosearch
   */
  geosearch = (...args) => new GeoSearchCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/geosearchstore
   */
  geosearchstore = (...args) => new GeoSearchStoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/get
   */
  get = (...args) => new GetCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/getbit
   */
  getbit = (...args) => new GetBitCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/getdel
   */
  getdel = (...args) => new GetDelCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/getex
   */
  getex = (...args) => new GetExCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/getrange
   */
  getrange = (...args) => new GetRangeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/getset
   */
  getset = (key, value) => new GetSetCommand([key, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hdel
   */
  hdel = (...args) => new HDelCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hexists
   */
  hexists = (...args) => new HExistsCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hexpire
   */
  hexpire = (...args) => new HExpireCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hexpireat
   */
  hexpireat = (...args) => new HExpireAtCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hexpiretime
   */
  hexpiretime = (...args) => new HExpireTimeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/httl
   */
  httl = (...args) => new HTtlCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hpexpire
   */
  hpexpire = (...args) => new HPExpireCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hpexpireat
   */
  hpexpireat = (...args) => new HPExpireAtCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hpexpiretime
   */
  hpexpiretime = (...args) => new HPExpireTimeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hpttl
   */
  hpttl = (...args) => new HPTtlCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hpersist
   */
  hpersist = (...args) => new HPersistCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hget
   */
  hget = (...args) => new HGetCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hgetall
   */
  hgetall = (...args) => new HGetAllCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hgetdel
   */
  hgetdel = (...args) => new HGetDelCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hgetex
   */
  hgetex = (...args) => new HGetExCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hincrby
   */
  hincrby = (...args) => new HIncrByCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hincrbyfloat
   */
  hincrbyfloat = (...args) => new HIncrByFloatCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hkeys
   */
  hkeys = (...args) => new HKeysCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hlen
   */
  hlen = (...args) => new HLenCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hmget
   */
  hmget = (...args) => new HMGetCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hmset
   */
  hmset = (key, kv2) => new HMSetCommand([key, kv2], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hrandfield
   */
  hrandfield = (key, count, withValues) => new HRandFieldCommand([key, count, withValues], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hscan
   */
  hscan = (...args) => new HScanCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hset
   */
  hset = (key, kv2) => new HSetCommand([key, kv2], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hsetex
   */
  hsetex = (...args) => new HSetExCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hsetnx
   */
  hsetnx = (key, field, value) => new HSetNXCommand([key, field, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hstrlen
   */
  hstrlen = (...args) => new HStrLenCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/hvals
   */
  hvals = (...args) => new HValsCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/incr
   */
  incr = (...args) => new IncrCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/incrby
   */
  incrby = (...args) => new IncrByCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/incrbyfloat
   */
  incrbyfloat = (...args) => new IncrByFloatCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/keys
   */
  keys = (...args) => new KeysCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lindex
   */
  lindex = (...args) => new LIndexCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/linsert
   */
  linsert = (key, direction, pivot, value) => new LInsertCommand([key, direction, pivot, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/llen
   */
  llen = (...args) => new LLenCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lmove
   */
  lmove = (...args) => new LMoveCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lpop
   */
  lpop = (...args) => new LPopCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lmpop
   */
  lmpop = (...args) => new LmPopCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lpos
   */
  lpos = (...args) => new LPosCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lpush
   */
  lpush = (key, ...elements) => new LPushCommand([key, ...elements], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lpushx
   */
  lpushx = (key, ...elements) => new LPushXCommand([key, ...elements], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lrange
   */
  lrange = (...args) => new LRangeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lrem
   */
  lrem = (key, count, value) => new LRemCommand([key, count, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/lset
   */
  lset = (key, index, value) => new LSetCommand([key, index, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/ltrim
   */
  ltrim = (...args) => new LTrimCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/mget
   */
  mget = (...args) => new MGetCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/mset
   */
  mset = (kv2) => new MSetCommand([kv2], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/msetnx
   */
  msetnx = (kv2) => new MSetNXCommand([kv2], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/persist
   */
  persist = (...args) => new PersistCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/pexpire
   */
  pexpire = (...args) => new PExpireCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/pexpireat
   */
  pexpireat = (...args) => new PExpireAtCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/pfadd
   */
  pfadd = (...args) => new PfAddCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/pfcount
   */
  pfcount = (...args) => new PfCountCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/pfmerge
   */
  pfmerge = (...args) => new PfMergeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/ping
   */
  ping = (args) => new PingCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/psetex
   */
  psetex = (key, ttl, value) => new PSetEXCommand([key, ttl, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/psubscribe
   */
  psubscribe = (patterns) => {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    return new Subscriber(this.client, patternArray, true, this.opts);
  };
  /**
   * @see https://redis.io/commands/pttl
   */
  pttl = (...args) => new PTtlCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/publish
   */
  publish = (...args) => new PublishCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/randomkey
   */
  randomkey = () => new RandomKeyCommand().exec(this.client);
  /**
   * @see https://redis.io/commands/rename
   */
  rename = (...args) => new RenameCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/renamenx
   */
  renamenx = (...args) => new RenameNXCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/rpop
   */
  rpop = (...args) => new RPopCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/rpush
   */
  rpush = (key, ...elements) => new RPushCommand([key, ...elements], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/rpushx
   */
  rpushx = (key, ...elements) => new RPushXCommand([key, ...elements], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sadd
   */
  sadd = (key, member, ...members) => new SAddCommand([key, member, ...members], this.opts).exec(this.client);
  scan(cursor, opts) {
    return new ScanCommand([cursor, opts], this.opts).exec(this.client);
  }
  /**
   * @see https://redis.io/commands/scard
   */
  scard = (...args) => new SCardCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/script-exists
   */
  scriptExists = (...args) => new ScriptExistsCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/script-flush
   */
  scriptFlush = (...args) => new ScriptFlushCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/script-load
   */
  scriptLoad = (...args) => new ScriptLoadCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sdiff
   */
  sdiff = (...args) => new SDiffCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sdiffstore
   */
  sdiffstore = (...args) => new SDiffStoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/set
   */
  set = (key, value, opts) => new SetCommand([key, value, opts], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/setbit
   */
  setbit = (...args) => new SetBitCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/setex
   */
  setex = (key, ttl, value) => new SetExCommand([key, ttl, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/setnx
   */
  setnx = (key, value) => new SetNxCommand([key, value], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/setrange
   */
  setrange = (...args) => new SetRangeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sinter
   */
  sinter = (...args) => new SInterCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sintercard
   */
  sintercard = (...args) => new SInterCardCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sinterstore
   */
  sinterstore = (...args) => new SInterStoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sismember
   */
  sismember = (key, member) => new SIsMemberCommand([key, member], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/smismember
   */
  smismember = (key, members) => new SMIsMemberCommand([key, members], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/smembers
   */
  smembers = (...args) => new SMembersCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/smove
   */
  smove = (source, destination, member) => new SMoveCommand([source, destination, member], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/spop
   */
  spop = (...args) => new SPopCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/srandmember
   */
  srandmember = (...args) => new SRandMemberCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/srem
   */
  srem = (key, ...members) => new SRemCommand([key, ...members], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sscan
   */
  sscan = (...args) => new SScanCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/strlen
   */
  strlen = (...args) => new StrLenCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/subscribe
   */
  subscribe = (channels) => {
    const channelArray = Array.isArray(channels) ? channels : [channels];
    return new Subscriber(this.client, channelArray, false, this.opts);
  };
  /**
   * @see https://redis.io/commands/sunion
   */
  sunion = (...args) => new SUnionCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/sunionstore
   */
  sunionstore = (...args) => new SUnionStoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/time
   */
  time = () => new TimeCommand().exec(this.client);
  /**
   * @see https://redis.io/commands/touch
   */
  touch = (...args) => new TouchCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/ttl
   */
  ttl = (...args) => new TtlCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/type
   */
  type = (...args) => new TypeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/unlink
   */
  unlink = (...args) => new UnlinkCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xadd
   */
  xadd = (...args) => new XAddCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xack
   */
  xack = (...args) => new XAckCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xackdel
   */
  xackdel = (...args) => new XAckDelCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xdel
   */
  xdel = (...args) => new XDelCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xdelex
   */
  xdelex = (...args) => new XDelExCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xgroup
   */
  xgroup = (...args) => new XGroupCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xread
   */
  xread = (...args) => new XReadCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xreadgroup
   */
  xreadgroup = (...args) => new XReadGroupCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xinfo
   */
  xinfo = (...args) => new XInfoCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xlen
   */
  xlen = (...args) => new XLenCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xpending
   */
  xpending = (...args) => new XPendingCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xclaim
   */
  xclaim = (...args) => new XClaimCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xautoclaim
   */
  xautoclaim = (...args) => new XAutoClaim(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xtrim
   */
  xtrim = (...args) => new XTrimCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xrange
   */
  xrange = (...args) => new XRangeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/xrevrange
   */
  xrevrange = (...args) => new XRevRangeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zadd
   */
  zadd = (...args) => {
    if ("score" in args[1]) {
      return new ZAddCommand([args[0], args[1], ...args.slice(2)], this.opts).exec(
        this.client
      );
    }
    return new ZAddCommand(
      [args[0], args[1], ...args.slice(2)],
      this.opts
    ).exec(this.client);
  };
  /**
   * @see https://redis.io/commands/zcard
   */
  zcard = (...args) => new ZCardCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zcount
   */
  zcount = (...args) => new ZCountCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zdiffstore
   */
  zdiffstore = (...args) => new ZDiffStoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zincrby
   */
  zincrby = (key, increment, member) => new ZIncrByCommand([key, increment, member], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zinterstore
   */
  zinterstore = (...args) => new ZInterStoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zlexcount
   */
  zlexcount = (...args) => new ZLexCountCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zmscore
   */
  zmscore = (...args) => new ZMScoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zpopmax
   */
  zpopmax = (...args) => new ZPopMaxCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zpopmin
   */
  zpopmin = (...args) => new ZPopMinCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zrange
   */
  zrange = (...args) => new ZRangeCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zrank
   */
  zrank = (key, member) => new ZRankCommand([key, member], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zrem
   */
  zrem = (key, ...members) => new ZRemCommand([key, ...members], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zremrangebylex
   */
  zremrangebylex = (...args) => new ZRemRangeByLexCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zremrangebyrank
   */
  zremrangebyrank = (...args) => new ZRemRangeByRankCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zremrangebyscore
   */
  zremrangebyscore = (...args) => new ZRemRangeByScoreCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zrevrank
   */
  zrevrank = (key, member) => new ZRevRankCommand([key, member], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zscan
   */
  zscan = (...args) => new ZScanCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zscore
   */
  zscore = (key, member) => new ZScoreCommand([key, member], this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zunion
   */
  zunion = (...args) => new ZUnionCommand(args, this.opts).exec(this.client);
  /**
   * @see https://redis.io/commands/zunionstore
   */
  zunionstore = (...args) => new ZUnionStoreCommand(args, this.opts).exec(this.client);
};
var VERSION = "v1.38.0";

// ../quant-macro-scanner/node_modules/@upstash/redis/nodejs.mjs
var BUILD = /* @__PURE__ */ Symbol("build");
var TextFieldBuilder = class _TextFieldBuilder {
  _noTokenize;
  _noStem;
  _from;
  constructor(noTokenize = { noTokenize: false }, noStem = { noStem: false }, from = { from: null }) {
    this._noTokenize = noTokenize;
    this._noStem = noStem;
    this._from = from;
  }
  noTokenize() {
    return new _TextFieldBuilder({ noTokenize: true }, this._noStem, this._from);
  }
  noStem() {
    return new _TextFieldBuilder(this._noTokenize, { noStem: true }, this._from);
  }
  from(field) {
    return new _TextFieldBuilder(this._noTokenize, this._noStem, { from: field });
  }
  [BUILD]() {
    return {
      type: "TEXT",
      ...this._noTokenize.noTokenize ? { noTokenize: true } : {},
      ...this._noStem.noStem ? { noStem: true } : {},
      ...this._from.from ? { from: this._from.from } : {}
    };
  }
};
var NumericFieldBuilder = class _NumericFieldBuilder {
  type;
  _from;
  constructor(type, from = { from: null }) {
    this.type = type;
    this._from = from;
  }
  from(field) {
    return new _NumericFieldBuilder(this.type, { from: field });
  }
  [BUILD]() {
    return this._from.from ? {
      type: this.type,
      fast: true,
      from: this._from.from
    } : {
      type: this.type,
      fast: true
    };
  }
};
var BoolFieldBuilder = class _BoolFieldBuilder {
  _fast;
  _from;
  constructor(fast = { fast: false }, from = { from: null }) {
    this._fast = fast;
    this._from = from;
  }
  fast() {
    return new _BoolFieldBuilder({ fast: true }, this._from);
  }
  from(field) {
    return new _BoolFieldBuilder(this._fast, { from: field });
  }
  [BUILD]() {
    const hasFast = this._fast.fast;
    const hasFrom = Boolean(this._from.from);
    if (hasFast && hasFrom) {
      return {
        type: "BOOL",
        fast: true,
        from: this._from.from
      };
    }
    if (hasFast) {
      return {
        type: "BOOL",
        fast: true
      };
    }
    if (hasFrom) {
      return {
        type: "BOOL",
        from: this._from.from
      };
    }
    return { type: "BOOL" };
  }
};
var DateFieldBuilder = class _DateFieldBuilder {
  _fast;
  _from;
  constructor(fast = { fast: false }, from = { from: null }) {
    this._fast = fast;
    this._from = from;
  }
  fast() {
    return new _DateFieldBuilder({ fast: true }, this._from);
  }
  from(field) {
    return new _DateFieldBuilder(this._fast, { from: field });
  }
  [BUILD]() {
    const hasFast = this._fast.fast;
    const hasFrom = Boolean(this._from.from);
    if (hasFast && hasFrom) {
      return {
        type: "DATE",
        fast: true,
        from: this._from.from
      };
    }
    if (hasFast) {
      return {
        type: "DATE",
        fast: true
      };
    }
    if (hasFrom) {
      return {
        type: "DATE",
        from: this._from.from
      };
    }
    return { type: "DATE" };
  }
};
var KeywordFieldBuilder = class {
  [BUILD]() {
    return { type: "KEYWORD" };
  }
};
var FacetFieldBuilder = class {
  [BUILD]() {
    return { type: "FACET" };
  }
};
if (typeof atob === "undefined") {
  global.atob = (b64) => Buffer.from(b64, "base64").toString("utf8");
}
var Redis2 = class _Redis extends Redis {
  /**
   * Create a new redis client by providing a custom `Requester` implementation
   *
   * @example
   * ```ts
   *
   * import { UpstashRequest, Requester, UpstashResponse, Redis } from "@upstash/redis"
   *
   *  const requester: Requester = {
   *    request: <TResult>(req: UpstashRequest): Promise<UpstashResponse<TResult>> => {
   *      // ...
   *    }
   *  }
   *
   * const redis = new Redis(requester)
   * ```
   */
  constructor(configOrRequester) {
    if ("request" in configOrRequester) {
      super(configOrRequester);
      return;
    }
    if (!configOrRequester.url) {
      console.warn(
        `[Upstash Redis] The 'url' property is missing or undefined in your Redis config.`
      );
    } else if (configOrRequester.url.startsWith(" ") || configOrRequester.url.endsWith(" ") || /\r|\n/.test(configOrRequester.url)) {
      console.warn(
        "[Upstash Redis] The redis url contains whitespace or newline, which can cause errors!"
      );
    }
    if (!configOrRequester.token) {
      console.warn(
        `[Upstash Redis] The 'token' property is missing or undefined in your Redis config.`
      );
    } else if (configOrRequester.token.startsWith(" ") || configOrRequester.token.endsWith(" ") || /\r|\n/.test(configOrRequester.token)) {
      console.warn(
        "[Upstash Redis] The redis token contains whitespace or newline, which can cause errors!"
      );
    }
    const client2 = new HttpClient({
      baseUrl: configOrRequester.url,
      retry: configOrRequester.retry,
      headers: { authorization: `Bearer ${configOrRequester.token}` },
      agent: configOrRequester.agent,
      responseEncoding: configOrRequester.responseEncoding,
      cache: configOrRequester.cache ?? "no-store",
      signal: configOrRequester.signal,
      keepAlive: configOrRequester.keepAlive,
      readYourWrites: configOrRequester.readYourWrites
    });
    const safeEnv = typeof process === "object" && process && typeof process.env === "object" && process.env ? process.env : {};
    super(client2, {
      automaticDeserialization: configOrRequester.automaticDeserialization,
      enableTelemetry: configOrRequester.enableTelemetry ?? !safeEnv.UPSTASH_DISABLE_TELEMETRY,
      latencyLogging: configOrRequester.latencyLogging,
      enableAutoPipelining: configOrRequester.enableAutoPipelining
    });
    const nodeVersion = typeof process === "object" && process ? process.version : void 0;
    this.addTelemetry({
      runtime: (
        // @ts-expect-error to silence compiler
        typeof EdgeRuntime === "string" ? "edge-light" : nodeVersion ? `node@${nodeVersion}` : "unknown"
      ),
      platform: safeEnv.UPSTASH_CONSOLE ? "console" : safeEnv.VERCEL ? "vercel" : safeEnv.AWS_REGION ? "aws" : "unknown",
      sdk: `@upstash/redis@${VERSION}`
    });
    if (this.enableAutoPipelining) {
      return this.autoPipeline();
    }
  }
  /**
   * Create a new Upstash Redis instance from environment variables.
   *
   * Use this to automatically load connection secrets from your environment
   * variables. For instance when using the Vercel integration.
   *
   * This tries to load connection details from your environment using `process.env`:
   * - URL: `UPSTASH_REDIS_REST_URL` or fallback to `KV_REST_API_URL`
   * - Token: `UPSTASH_REDIS_REST_TOKEN` or fallback to `KV_REST_API_TOKEN`
   *
   * The fallback variables provide compatibility with Vercel KV and other platforms
   * that may use different naming conventions.
   */
  static fromEnv(config) {
    if (typeof process !== "object" || !process || typeof process.env !== "object" || !process.env) {
      throw new TypeError(
        '[Upstash Redis] Unable to get environment variables, `process.env` is undefined. If you are deploying to cloudflare, please import from "@upstash/redis/cloudflare" instead'
      );
    }
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    if (!url) {
      console.warn("[Upstash Redis] Unable to find environment variable: `UPSTASH_REDIS_REST_URL`");
    }
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!token) {
      console.warn(
        "[Upstash Redis] Unable to find environment variable: `UPSTASH_REDIS_REST_TOKEN`"
      );
    }
    return new _Redis({ ...config, url, token });
  }
};

// lib/cotuc/data-version.ts
var COTUC_VERSION_KEY = "cotuc:data-version";
var TTL_SEC = 2 * 24 * 3600;
var client;
function kv() {
  if (client !== void 0) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis2({ url, token }) : null;
  return client;
}
async function bumpCotucDataVersion(now = Date.now()) {
  const c = kv();
  if (!c) return null;
  const v = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await c.set(COTUC_VERSION_KEY, v);
    return v;
  } catch {
    return null;
  }
}

// lib/cotuc/decision-state-lite.ts
var arr = (v) => Array.isArray(v) ? v : [];
async function loadBacktestRates() {
  const rows = await storeList("decision", { fields: ["ticker", "snapshot.backtest"] });
  return rows.map((r) => ({
    ticker: r.ticker,
    bt: arr(r.snapshot?.backtest).map((w) => ({ id: w.id, nEvents: w.nEvents, winRate: w.winRate }))
  }));
}

// lib/quant-cotuc.ts
var DIVIDEND_STOCKS = [
  { ticker: "BMP", name: "Nh\u1EF1a B\xECnh Minh", sector: "V\u1EADt li\u1EC7u XD", price: 115e3, pe: 9.8, roe: 32.1, dividendYield: 11.2, payoutRatio: 95, debtEquity: 0.05, growth: 12.3, marketCap: "Large", eps: 11734, fscore: 8, grossMargin: 41.2, pros: ["C\u1ED5 t\u1EE9c b\u1EC1n b\u1EC9 cao v\u01B0\u1EE3t tr\u1ED9i", "Th\u1EBF \u0111\u1ED9c quy\u1EC1n nh\xF3m", "T\xE0i ch\xEDnh g\u1EA7n nh\u01B0 kh\xF4ng n\u1EE3"], cons: ["Chi ph\xED h\u1EA1t nh\u1EF1a theo gi\xE1 d\u1EA7u", "B\u0110S d\xE2n d\u1EE5ng ph\u1EE5c h\u1ED3i ch\u1EADm"], technicalTrend: "Bullish", rsi: 62, revenueGrowthQtr: 14.5, institutionalHold: 55.4, exDividendDate: "12/06/2026", paymentDate: "05/07/2026", dividendAmount: 12e3, catalystScore: 9, newsSentiment: "Strong Positive", sectorWaveScore: 7.8, agmDate: "25/04/2026", agmAgenda: "Th\xF4ng qua chia c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t 100% v\xE0 ph\u01B0\u01A1ng \xE1n mua c\u1ED5 phi\u1EBFu qu\u1EF9", insiderStatus: "Nawaplastic/SCG li\xEAn t\u1EE5c gom gi\u1EEF", macroCatalyst: "Th\xE1o g\u1EE1 ph\xE1p l\xFD nh\xE0 \u1EDF d\xE2n d\u1EE5ng", globalIndicator: "Gi\xE1 h\u1EA1t nh\u1EF1a PVC", globalTrend: "Gi\u1EA3m m\u1EA1nh \u2014 n\u1EDBi bi\xEAn LN g\u1ED9p" },
  { ticker: "FPT", name: "FPT Corporation", sector: "C\xF4ng ngh\u1EC7 TT", price: 135e3, pe: 18.5, roe: 25.4, dividendYield: 3.5, payoutRatio: 45, debtEquity: 0.5, growth: 20.1, marketCap: "Large", eps: 7297, fscore: 7, grossMargin: 38.5, pros: ["T\u0103ng tr\u01B0\u1EDFng 20%/n\u0103m \u1ED5n \u0111\u1ECBnh", "V\u1ECB th\u1EBF c\xF4ng ngh\u1EC7 s\u1ED1 1", "D\xF2ng ti\u1EC1n vi\u1EC5n th\xF4ng t\u1ED1t"], cons: ["P/E s\xE1t \u0111\u1EC9nh l\u1ECBch s\u1EED", "\xC1p l\u1EF1c tuy\u1EC3n d\u1EE5ng cao c\u1EA5p"], technicalTrend: "Bullish", rsi: 68, revenueGrowthQtr: 22.1, institutionalHold: 49, exDividendDate: "28/05/2026", paymentDate: "18/06/2026", dividendAmount: 3e3, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 9.5, agmDate: "04/04/2026", agmAgenda: "Ph\xEA chu\u1EA9n c\u1ED5 phi\u1EBFu th\u01B0\u1EDFng 20% v\xE0 t\u1EA1m \u1EE9ng c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t \u0111\u1EE3t m\u1EDBi", insiderStatus: "Kh\u1ED1i ngo\u1EA1i gi\u1EEF k\xEDn room 49%", macroCatalyst: "Chuy\u1EC3n \u0111\u1ED5i s\u1ED1 qu\u1ED1c gia v\xE0 Data Center", globalIndicator: "Nasdaq / Chi ti\xEAu AI to\xE0n c\u1EA7u", globalTrend: "T\u0103ng m\u1EA1nh \u2014 l\xE0n s\xF3ng AI & b\xE1n d\u1EABn" },
  { ticker: "VNM", name: "Vinamilk", sector: "Th\u1EF1c ph\u1EA9m", price: 66e3, pe: 16.2, roe: 19.2, dividendYield: 5.8, payoutRatio: 75, debtEquity: 0.15, growth: 3.5, marketCap: "Large", eps: 4074, fscore: 6, grossMargin: 40.8, pros: ["Th\u01B0\u01A1ng hi\u1EC7u s\u1EEFa s\u1ED1 1 n\u1ED9i \u0111\u1ECBa", "D\xF2ng ti\u1EC1n ho\u1EA1t \u0111\u1ED9ng m\u1EA1nh", "C\u1ED5 t\u1EE9c \u0111\u1EC1u \u0111\u1EB7n 20 n\u0103m"], cons: ["Th\u1ECB tr\u01B0\u1EDDng s\u1EEFa b\xE3o h\xF2a", "C\u1EA1nh tranh kh\u1ED1c li\u1EC7t t\u1EEB ngo\u1EA1i"], technicalTrend: "Neutral", rsi: 48, revenueGrowthQtr: 4.1, institutionalHold: 46.2, exDividendDate: "05/06/2026", paymentDate: "30/06/2026", dividendAmount: 3850, catalystScore: 7, newsSentiment: "Neutral", sectorWaveScore: 5.2, agmDate: "26/04/2026", agmAgenda: "Duy tr\xEC t\u1EF7 l\u1EC7 c\u1ED5 t\u1EE9c cao, tr\u1EA5n an c\u1ED5 \u0111\xF4ng ngo\u1EA1i F&N", insiderStatus: "F&N Dairy gom th\xEAm khi gi\xE1 h\u1EA5p d\u1EABn", macroCatalyst: "\u0110\u1EA9y m\u1EA1nh xu\u1EA5t kh\u1EA9u sang Trung \u0110\xF4ng", globalIndicator: "Gi\xE1 b\u1ED9t s\u1EEFa GDT", globalTrend: "\u0110i ngang \u2014 ki\u1EC3m so\xE1t chi ph\xED t\u1ED1t" },
  { ticker: "DPM", name: "Ph\xE2n b\xF3n Ph\xFA M\u1EF9", sector: "H\xF3a ch\u1EA5t", price: 34500, pe: 8.5, roe: 14.5, dividendYield: 8.5, payoutRatio: 70, debtEquity: 0.08, growth: -5, marketCap: "Mid", eps: 4058, fscore: 5, grossMargin: 22.4, pros: ["Ti\u1EC1n g\u1EEDi ng\xE2n h\xE0ng d\u1ED3i d\xE0o", "P/B s\xE1t gi\xE1 tr\u1ECB s\u1ED5 s\xE1ch", "Kh\u1EA5u hao s\u1EAFp ho\xE0n t\u1EA5t"], cons: ["Gi\xE1 kh\xED \u0111\u1EA7u v\xE0o bi\u1EBFn \u0111\u1ED9ng", "Ph\u1EE5 thu\u1ED9c chu k\u1EF3 ure"], technicalTrend: "Bearish", rsi: 38, revenueGrowthQtr: -8.4, institutionalHold: 24.5, exDividendDate: "20/06/2026", paymentDate: "15/07/2026", dividendAmount: 3e3, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 6.9, agmDate: "18/04/2026", agmAgenda: "Tr\xECnh ph\u01B0\u01A1ng \xE1n chia c\u1ED5 t\u1EE9c \u0111\u1EB7c bi\u1EC7t t\u1EEB qu\u1EF9 \u0111\u1EA7u t\u01B0 l\u0169y k\u1EBF nhi\u1EC1u n\u0103m", insiderStatus: "PVN \u01B0u ti\xEAn thu c\u1ED5 t\u1EE9c v\u1EC1 ng\xE2n s\xE1ch", macroCatalyst: "Lu\u1EADt thu\u1EBF VAT ph\xE2n b\xF3n s\u1EEDa \u0111\u1ED5i", globalIndicator: "Gi\xE1 Ure th\u1EBF gi\u1EDBi FOB", globalTrend: "T\u0103ng nh\u1EB9 \u2014 ngu\u1ED3n cung th\u1EAFt ch\u1EB7t" },
  { ticker: "DCM", name: "Ph\xE2n b\xF3n C\xE0 Mau", sector: "H\xF3a ch\u1EA5t", price: 32e3, pe: 7.9, roe: 16.1, dividendYield: 9, payoutRatio: 65, debtEquity: 0.04, growth: -2.1, marketCap: "Mid", eps: 4050, fscore: 7, grossMargin: 24.1, pros: ["\u0110\xE3 xong kh\u1EA5u hao nh\xE0 m\xE1y", "N\u1EE3 vay b\u1EB1ng kh\xF4ng", "XK \u0110\xF4ng Nam \xC1 ti\u1EC1m n\u0103ng"], cons: ["R\u1EE7i ro th\u1EDDi ti\u1EBFt s\u1EE9c mua", "Ngu\u1ED3n kh\xED \u0111\u1EA7u v\xE0o h\u1EA1n ch\u1EBF"], technicalTrend: "Neutral", rsi: 45, revenueGrowthQtr: 3.2, institutionalHold: 18.2, exDividendDate: "25/06/2026", paymentDate: "20/07/2026", dividendAmount: 2e3, catalystScore: 9, newsSentiment: "Strong Positive", sectorWaveScore: 8.2, agmDate: "22/04/2026", agmAgenda: "C\xF4ng b\u1ED1 k\u1EBF ho\u1EA1ch b\xF9ng n\u1ED5 c\u1ED5 t\u1EE9c 2026 nh\u1EDD kh\u1EA5u hao gi\u1EA3m v\u1EC1 m\u1EE9c t\u1ED1i thi\u1EC3u", insiderStatus: "Ban \u0111i\u1EC1u h\xE0nh mua t\xEDch l\u0169y n\u1ED9i b\u1ED9", macroCatalyst: "Gi\xE1 g\u1EA1o neo cao th\xFAc \u0111\u1EA9y n\xF4ng d\xE2n b\xF3n ph\xE2n", globalIndicator: "Gi\xE1 Ure \xC1 \u0110\xF4ng", globalTrend: "T\u0103ng m\u1EA1nh \u2014 gi\xE1n \u0111o\u1EA1n cung t\u1EEB TQ" },
  { ticker: "REE", name: "C\u01A1 \u0110i\u1EC7n L\u1EA1nh REE", sector: "N\u0103ng l\u01B0\u1EE3ng", price: 61e3, pe: 11.2, roe: 15.2, dividendYield: 4.5, payoutRatio: 35, debtEquity: 0.6, growth: 8.5, marketCap: "Mid", eps: 5446, fscore: 6, grossMargin: 28.3, pros: ["T\xE0i s\u1EA3n sinh l\u1EDDi ph\xF2ng th\u1EE7", "D\xF2ng ti\u1EC1n cho thu\xEA v\u0103n ph\xF2ng cao", "L\xE3nh \u0111\u1EA1o chi\u1EBFn l\u01B0\u1EE3c d\xE0i h\u1EA1n"], cons: ["Th\u1EE7y \u0111i\u1EC7n nh\u1EA1y c\u1EA3m El Nino", "M\u1EA3ng M&E ph\u1EE5c h\u1ED3i ch\u1EADm"], technicalTrend: "Bullish", rsi: 58, revenueGrowthQtr: 10.5, institutionalHold: 38.1, exDividendDate: "10/07/2026", paymentDate: "05/08/2026", dividendAmount: 2500, catalystScore: 7, newsSentiment: "Positive", sectorWaveScore: 7.5, agmDate: "15/06/2026", agmAgenda: "C\u1EADp nh\u1EADt d\u1EF1 \xE1n Etown 6 v\xE0 k\u1EBF ho\u1EA1ch c\u1ED5 t\u1EE9c n\u0103m t\xE0i ch\xEDnh m\u1EDBi", insiderStatus: "Gia \u0111\xECnh b\xE0 Mai Thanh v\xE0 Platinum Victory gia c\u1ED1 s\u1EDF h\u1EEFu", macroCatalyst: "Quy ho\u1EA1ch \u0110i\u1EC7n VIII \u01B0u ti\xEAn th\u1EE7y \u0111i\u1EC7n", globalIndicator: "Xu th\u1EBF n\u0103ng l\u01B0\u1EE3ng xanh", globalTrend: "T\u0103ng n\xF3ng \u2014 v\u1ED1n qu\u1ED1c t\u1EBF \u0111\u1ED5 v\xE0o xanh" },
  { ticker: "ACB", name: "Ng\xE2n h\xE0ng \xC1 Ch\xE2u", sector: "Ng\xE2n h\xE0ng", price: 26e3, pe: 6.2, roe: 24.5, dividendYield: 5, payoutRatio: 25, debtEquity: 0.85, growth: 16.5, marketCap: "Large", eps: 4193, fscore: 8, grossMargin: 45, pros: ["Ch\u1EA5t l\u01B0\u1EE3ng t\xE0i s\u1EA3n t\u1ED1t nh\u1EA5t h\u1EC7 th\u1ED1ng", "N\u1EE3 x\u1EA5u c\u1EF1c th\u1EA5p", "ROE d\u1EABn \u0111\u1EA7u ng\xE0nh"], cons: ["T\xEDn d\u1EE5ng b\u1ECB gi\u1EDBi h\u1EA1n b\u1EDFi NHNN", "\u0110\xF2n b\u1EA9y \u0111\u1EB7c th\xF9 ng\xE2n h\xE0ng"], technicalTrend: "Bullish", rsi: 60, revenueGrowthQtr: 15.2, institutionalHold: 32.1, exDividendDate: "02/06/2026", paymentDate: "25/06/2026", dividendAmount: 1500, catalystScore: 9, newsSentiment: "Strong Positive", sectorWaveScore: 8.8, agmDate: "03/04/2026", agmAgenda: "Th\xF4ng qua c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t 15% + c\u1ED5 phi\u1EBFu th\u01B0\u1EDFng 10% \u2014 m\u1EE9c cao k\u1EF7 l\u1EE5c", insiderStatus: "Gia \u0111\xECnh Ch\u1EE7 t\u1ECBch Tr\u1EA7n H\xF9ng Huy v\xE0 Dragon Capital \u0111\u1ED3ng thu\u1EADn", macroCatalyst: "Th\xF4ng t\u01B0 gia h\u1EA1n n\u1EE3 x\u1EA5u gi\xFAp ACB NPL<1%", globalIndicator: "Basel III / L\xE3i su\u1EA5t Fed", globalTrend: "T\xEDch c\u1EF1c \u2014 h\u1EA1 l\xE3i su\u1EA5t Fed gi\u1EA3i t\u1ECFa t\u1EF7 gi\xE1" },
  { ticker: "GAS", name: "PetroVietnam Gas", sector: "D\u1EA7u kh\xED", price: 76e3, pe: 14.8, roe: 20.2, dividendYield: 6.2, payoutRatio: 60, debtEquity: 0.18, growth: 5.5, marketCap: "Large", eps: 5135, fscore: 7, grossMargin: 18.2, pros: ["\u0110\u1ED9c quy\u1EC1n kh\xED t\u1EF1 nhi\xEAn to\xE0n qu\u1ED1c", "Ti\u1EC1n m\u1EB7t t\xEDch l\u0169y l\u1EDBn", "Ti\u1EC1m n\u0103ng h\u1EA1 t\u1EA7ng LNG"], cons: ["S\u1EA3n l\u01B0\u1EE3ng m\u1ECF truy\u1EC1n th\u1ED1ng suy gi\u1EA3m", "Gi\xE1 b\xE1n kh\xED nh\u1EA1y c\u1EA3m d\u1EA7u"], technicalTrend: "Neutral", rsi: 47, revenueGrowthQtr: 3.8, institutionalHold: 95.7, exDividendDate: "30/06/2026", paymentDate: "25/07/2026", dividendAmount: 4500, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 7.2, agmDate: "08/05/2026", agmAgenda: "Ph\xEA duy\u1EC7t c\u01A1 ch\u1EBF b\xE1n kh\xED LNG m\u1EDBi v\xE0 k\u1EBF ho\u1EA1ch c\u1ED5 t\u1EE9c v\u1EEFng m\u1EA1nh", insiderStatus: "Nh\xE0 n\u01B0\u1EDBc s\u1EDF h\u1EEFu 95% qua PVN", macroCatalyst: "N\xE2ng gi\xE1 kh\xED LNG c\u1EA5p Nh\u01A1n Tr\u1EA1ch 3&4", globalIndicator: "Gi\xE1 LNG Henry Hub", globalTrend: "T\u0103ng \u1ED5n \u0111\u1ECBnh \u2014 n\u0103ng l\u01B0\u1EE3ng s\u1EA1ch t\u0103ng" },
  { ticker: "DHG", name: "D\u01B0\u1EE3c H\u1EADu Giang", sector: "D\u01B0\u1EE3c ph\u1EA9m", price: 112e3, pe: 13.5, roe: 22.3, dividendYield: 5.5, payoutRatio: 60, debtEquity: 0.02, growth: 8, marketCap: "Mid", eps: 8296, fscore: 7, grossMargin: 46.5, pros: ["T\xE0i ch\xEDnh an to\xE0n tuy\u1EC7t \u0111\u1ED1i", "H\u01B0\u1EDFng l\u1EE3i nh\xE2n kh\u1EA9u gi\xE0 h\xF3a", "Japan-GMP hi\u1EC7n \u0111\u1EA1i"], cons: ["C\u1EA1nh tranh \u0111\u1EA5u th\u1EA7u b\u1EC7nh vi\u1EC7n", "Nguy\xEAn li\u1EC7u ph\u1EE5 thu\u1ED9c t\u1EF7 gi\xE1"], technicalTrend: "Neutral", rsi: 50, revenueGrowthQtr: 7.5, institutionalHold: 52, exDividendDate: "14/06/2026", paymentDate: "08/07/2026", dividendAmount: 6e3, catalystScore: 7, newsSentiment: "Neutral", sectorWaveScore: 6, agmDate: "28/04/2026", agmAgenda: "Taisho cam k\u1EBFt ti\u1EBFp t\u1EE5c ch\xEDnh s\xE1ch c\u1ED5 t\u1EE9c cao \u0111\u1EC1u \u0111\u1EB7n h\xE0ng n\u0103m", insiderStatus: "Taisho Pharmaceutical Nh\u1EADt n\u1EAFm 51%", macroCatalyst: "Lu\u1EADt D\u01B0\u1EE3c s\u1EEDa \u0111\u1ED5i n\u1EDBi l\u1ECFng \u0111\u1EA5u th\u1EA7u Japan-GMP", globalIndicator: "Xu h\u01B0\u1EDBng biotech & y t\u1EBF s\u1ED1", globalTrend: "T\u0103ng \u0111\u1EC1u \u2014 d\xF2ng ti\u1EC1n y t\u1EBF ph\xF2ng th\u1EE7 cao" },
  { ticker: "SAB", name: "Sabeco", sector: "Th\u1EF1c ph\u1EA9m", price: 78e3, pe: 19.5, roe: 28.1, dividendYield: 6.5, payoutRatio: 80, debtEquity: 0.12, growth: 7.5, marketCap: "Large", eps: 4e3, fscore: 7, grossMargin: 31.5, pros: ["Th\u01B0\u01A1ng hi\u1EC7u bia s\u1ED1 1 VN", "C\u1ED5 t\u1EE9c b\u1EC1n v\u1EEFng v\xE0 cao", "N\u1EE3 vay th\u1EA5p"], cons: ["P/E cao so v\u1EDBi ng\xE0nh", "\xC1p l\u1EF1c thu\u1EBF ti\xEAu th\u1EE5 \u0111\u1EB7c bi\u1EC7t"], technicalTrend: "Neutral", rsi: 49, revenueGrowthQtr: 6.2, institutionalHold: 53.6, exDividendDate: "22/07/2026", paymentDate: "17/08/2026", dividendAmount: 5e3, catalystScore: 7, newsSentiment: "Neutral", sectorWaveScore: 5.8, agmDate: "24/04/2026", agmAgenda: "Th\xF4ng qua k\u1EBF ho\u1EA1ch c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t v\xE0 \u1EE9ng ph\xF3 thu\u1EBF ti\xEAu th\u1EE5 \u0111\u1EB7c bi\u1EC7t m\u1EDBi", insiderStatus: "ThaiBev s\u1EDF h\u1EEFu 53.6%, t\u1ED1i \u01B0u chu\u1ED7i cung \u1EE9ng to\xE0n khu v\u1EF1c", macroCatalyst: "Kinh t\u1EBF ph\u1EE5c h\u1ED3i \u0111\u1EA9y ti\xEAu th\u1EE5 bia v\u1EC1 \u0111\u1EC9nh l\u1ECBch s\u1EED", globalIndicator: "Gi\xE1 l\xFAa m\u1EA1ch, g\u1EA1o nguy\xEAn li\u1EC7u", globalTrend: "\u0110i ngang \u2014 \u1ED5n \u0111\u1ECBnh chi ph\xED nguy\xEAn li\u1EC7u" },
  { ticker: "GMD", name: "Gemadept", sector: "V\u1EADn t\u1EA3i bi\u1EC3n", price: 54e3, pe: 12.1, roe: 17.5, dividendYield: 5.2, payoutRatio: 50, debtEquity: 0.45, growth: 19, marketCap: "Mid", eps: 4463, fscore: 7, grossMargin: 35.8, pros: ["C\u1EA3ng Gemalink l\u1EDBn nh\u1EA5t VN", "H\u01B0\u1EDFng l\u1EE3i d\u1ECBch chuy\u1EC3n chu\u1ED7i cung \u1EE9ng", "D\xF2ng ti\u1EC1n c\u1EA3ng bi\u1EC3n ph\xF2ng th\u1EE7"], cons: ["Chi ph\xED \u0111\u1EA7u t\u01B0 h\u1EA1 t\u1EA7ng l\u1EDBn", "C\u1EA1nh tranh c\u1EA3ng khu v\u1EF1c \u0110NA"], technicalTrend: "Bullish", rsi: 59, revenueGrowthQtr: 21.3, institutionalHold: 31.5, exDividendDate: "05/08/2026", paymentDate: "30/08/2026", dividendAmount: 2500, catalystScore: 9, newsSentiment: "Strong Positive", sectorWaveScore: 8.8, agmDate: "14/04/2026", agmAgenda: "C\u1EADp nh\u1EADt hi\u1EC7u qu\u1EA3 Gemalink v\xE0 \u0111\u1EC1 xu\u1EA5t t\u0103ng t\u1EF7 l\u1EC7 c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t", insiderStatus: "Gemadept v\xE0 c\u1ED5 \u0111\xF4ng s\xE1ng l\u1EADp gia t\u0103ng chi ph\u1ED1i", macroCatalyst: "B\u1ED9 GTVT n\xE2ng khung gi\xE1 b\u1ED1c x\u1EBFp c\u1EA3ng bi\u1EC3n 10%", globalIndicator: "C\u01B0\u1EDBc container Drewry WCI", globalTrend: "T\u0103ng m\u1EA1nh \u2014 c\u0103ng th\u1EB3ng Bi\u1EC3n \u0110\u1ECF l\u1EC7ch cung c\u1EA7u" },
  { ticker: "MWG", name: "Th\u1EBF Gi\u1EDBi Di \u0110\u1ED9ng", sector: "B\xE1n l\u1EBB", price: 67e3, pe: 15.8, roe: 18.5, dividendYield: 3.8, payoutRatio: 48, debtEquity: 0.65, growth: 22, marketCap: "Large", eps: 4240, fscore: 7, grossMargin: 22.3, pros: ["H\u1EC7 th\u1ED1ng b\xE1n l\u1EBB s\u1ED1 1 VN", "An Khang m\u1EDF r\u1ED9ng nhanh", "T\u0103ng tr\u01B0\u1EDFng b\u1EE9t ph\xE1 h\u1EADu kh\u1EE7ng ho\u1EA3ng"], cons: ["Bi\xEAn LN m\u1ECFng", "\xC1p l\u1EF1c th\u01B0\u01A1ng m\u1EA1i \u0111i\u1EC7n t\u1EED"], technicalTrend: "Bullish", rsi: 63, revenueGrowthQtr: 24.5, institutionalHold: 44.2, exDividendDate: "08/08/2026", paymentDate: "03/09/2026", dividendAmount: 2e3, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 7.8, agmDate: "17/04/2026", agmAgenda: "C\u1EADp nh\u1EADt k\u1EBF ho\u1EA1ch m\u1EDF r\u1ED9ng An Khang v\xE0 ch\xEDnh s\xE1ch c\u1ED5 t\u1EE9c 2026", insiderStatus: "Founder Nguy\u1EC5n \u0110\u1EE9c T\xE0i v\xE0 nh\xF3m s\xE1ng l\u1EADp cam k\u1EBFt chi\u1EBFn l\u01B0\u1EE3c", macroCatalyst: "K\xEDch c\u1EA7u ti\xEAu d\xF9ng n\u1ED9i \u0111\u1ECBa v\xE0 gi\u1EA3m thu\u1EBF TNCN", globalIndicator: "Ch\u1EC9 s\u1ED1 ti\xEAu d\xF9ng b\xE1n l\u1EBB \u0110NA", globalTrend: "T\u0103ng m\u1EA1nh \u2014 s\u1EE9c mua ph\u1EE5c h\u1ED3i to\xE0n khu v\u1EF1c" },
  { ticker: "VCI", name: "Ch\u1EE9ng kho\xE1n Vietcap", sector: "Ch\u1EE9ng kho\xE1n", price: 38e3, pe: 10.2, roe: 21.5, dividendYield: 5.8, payoutRatio: 45, debtEquity: 0.4, growth: 28, marketCap: "Mid", eps: 3725, fscore: 8, grossMargin: 55, pros: ["T\u0103ng tr\u01B0\u1EDFng DT 28% b\u1EE9t ph\xE1", "M\u1EA3ng IB v\xE0 margin c\u1EF1c m\u1EA1nh", "P/B h\u1EA5p d\u1EABn nh\u1EA5t nh\xF3m CK"], cons: ["Nh\u1EA1y c\u1EA3m v\u1EDBi bi\u1EBFn \u0111\u1ED9ng thanh kho\u1EA3n", "R\u1EE7i ro margin call"], technicalTrend: "Bullish", rsi: 64, revenueGrowthQtr: 30.2, institutionalHold: 28, exDividendDate: "28/07/2026", paymentDate: "22/08/2026", dividendAmount: 2200, catalystScore: 9, newsSentiment: "Strong Positive", sectorWaveScore: 9.2, agmDate: "09/04/2026", agmAgenda: "Tr\xECnh ph\u01B0\u01A1ng \xE1n t\u0103ng v\u1ED1n v\xE0 chia c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t \u0111\xF3n \u0111\u1EA7u n\xE2ng h\u1EA1ng th\u1ECB tr\u01B0\u1EDDng", insiderStatus: "Dragon Capital v\xE0 VinaCapital t\u0103ng t\u1EF7 tr\u1ECDng tr\u01B0\u1EDBc n\xE2ng h\u1EA1ng", macroCatalyst: "KRX t\u0103ng m\u1EA1nh thanh kho\u1EA3n, m\u1EDF room margin r\u1ED9ng h\u01A1n", globalIndicator: "VN-Index & D\xF2ng v\u1ED1n ngo\u1EA1i ETF", globalTrend: "T\u0103ng t\u1ED1t \u2014 FTSE Emerging 2026 l\xE0 x\xFAc t\xE1c l\u1ECBch s\u1EED" },
  { ticker: "TCB", name: "Techcombank", sector: "Ng\xE2n h\xE0ng", price: 28500, pe: 7.1, roe: 19.8, dividendYield: 4.5, payoutRatio: 28, debtEquity: 0.82, growth: 18.5, marketCap: "Large", eps: 4014, fscore: 8, grossMargin: 52, pros: ["H\u1EC7 sinh th\xE1i s\u1ED1 & bancassurance s\u1ED1 1", "N\u1EC1n t\u1EA3ng kh\xE1ch h\xE0ng cao c\u1EA5p", "NIM duy tr\xEC cao"], cons: ["D\u1EF1 ph\xF2ng B\u0110S c\xF2n n\u1EB7ng", "Room t\xEDn d\u1EE5ng h\u1EA1n ch\u1EBF"], technicalTrend: "Bullish", rsi: 57, revenueGrowthQtr: 17.5, institutionalHold: 22.5, exDividendDate: "15/07/2026", paymentDate: "10/08/2026", dividendAmount: 1300, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 8.5, agmDate: "19/04/2026", agmAgenda: "Tr\xECnh k\u1EBF ho\u1EA1ch c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t l\u1EA7n \u0111\u1EA7u sau nhi\u1EC1u n\u0103m gi\u1EEF l\u1EA1i LN", insiderStatus: "H\u1ED3 H\xF9ng Anh v\xE0 Warburg Pincus cam k\u1EBFt d\xE0i h\u1EA1n", macroCatalyst: "G\xF3i k\xEDch c\u1EA7u t\xEDn d\u1EE5ng B\u0110S m\u1EDF kh\xF3a t\u0103ng tr\u01B0\u1EDFng Q3", globalIndicator: "Basel III / Fed Funds Rate", globalTrend: "Gi\u1EA3m d\u1EA7n \u2014 h\u1EA1 l\xE3i su\u1EA5t m\u1EDF r\u1ED9ng NIM" },
  { ticker: "HPG", name: "H\xF2a Ph\xE1t Group", sector: "Th\xE9p", price: 28e3, pe: 14.2, roe: 12.5, dividendYield: 3, payoutRatio: 30, debtEquity: 0.55, growth: 15, marketCap: "Large", eps: 1971, fscore: 6, grossMargin: 15.6, pros: ["Th\u1ECB ph\u1EA7n th\xE9p s\u1ED1 1 VN", "Chu\u1ED7i cung \u1EE9ng kh\xE9p k\xEDn", "H\u01B0\u1EDFng l\u1EE3i \u0111\u1EA7u t\u01B0 c\xF4ng"], cons: ["Th\xE9p c\xF3 t\xEDnh chu k\u1EF3 cao", "N\u1EE3 vay t\u0103ng khi \u0111\u1EA7u t\u01B0 DQ2"], technicalTrend: "Bullish", rsi: 61, revenueGrowthQtr: 18.2, institutionalHold: 35.6, exDividendDate: "15/06/2026", paymentDate: "10/07/2026", dividendAmount: 1e3, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 8.5, agmDate: "11/04/2026", agmAgenda: "C\u1EADp nh\u1EADt ti\u1EBFn \u0111\u1ED9 Dung Qu\u1EA5t 2 v\xE0 k\u1EBF ho\u1EA1ch t\u0103ng c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t t\u1EEB n\u0103m sau", insiderStatus: "Ch\u1EE7 t\u1ECBch Tr\u1EA7n \u0110\xECnh Long kh\u1EB3ng \u0111\u1ECBnh chu k\u1EF3 t\u0103ng m\u1EDBi", macroCatalyst: "\u0110\u01B0\u1EDDng s\u1EAFt cao t\u1ED1c B\u1EAFc-Nam v\xE0 Long Th\xE0nh", globalIndicator: "Gi\xE1 Th\xE9p HRC / Qu\u1EB7ng s\u1EAFt", globalTrend: "Ph\u1EE5c h\u1ED3i \u1ED5n \u0111\u1ECBnh \u2014 l\u1EF1c c\u1EA7u h\u1EA1 t\u1EA7ng" },
  { ticker: "NLG", name: "Nam Long Group", sector: "B\u1EA5t \u0111\u1ED9ng s\u1EA3n", price: 42e3, pe: 11.5, roe: 11.8, dividendYield: 3.5, payoutRatio: 35, debtEquity: 0.7, growth: 35, marketCap: "Mid", eps: 3652, fscore: 6, grossMargin: 28.5, pros: ["Qu\u1EF9 \u0111\u1EA5t s\u1EA1ch l\u1EDBn nh\u1EA5t affordable", "T\u1ED1c \u0111\u1ED9 b\xE0n giao t\u0103ng b\u1EE9t ph\xE1", "Ki\u1EC3m to\xE1n Big4 minh b\u1EA1ch"], cons: ["D\xF2ng ti\u1EC1n ph\u1EE5 thu\u1ED9c ti\u1EBFn \u0111\u1ED9 b\xE0n giao", "B\u0110S ph\u1EE5c h\u1ED3i ch\u01B0a \u0111\u1ED3ng \u0111\u1EC1u"], technicalTrend: "Bullish", rsi: 61, revenueGrowthQtr: 38.5, institutionalHold: 42.1, exDividendDate: "12/09/2026", paymentDate: "07/10/2026", dividendAmount: 1500, catalystScore: 8, newsSentiment: "Positive", sectorWaveScore: 7.5, agmDate: "30/04/2026", agmAgenda: "Th\xF4ng qua k\u1EBF ho\u1EA1ch b\xE0n giao 2026 v\xE0 t\u1EF7 l\u1EC7 c\u1ED5 t\u1EE9c b\u1EB1ng c\u1ED5 phi\u1EBFu", insiderStatus: "IFC World Bank duy tr\xEC c\u1ED5 ph\u1EA7n chi\u1EBFn l\u01B0\u1EE3c", macroCatalyst: "Lu\u1EADt Kinh doanh B\u0110S & Lu\u1EADt \u0110\u1EA5t \u0111ai gi\u1EA3i ph\xF3ng d\u1EF1 \xE1n", globalIndicator: "L\xE3i su\u1EA5t cho vay mua nh\xE0 VN", globalTrend: "Gi\u1EA3m d\u1EA7n \u2014 l\xE3i su\u1EA5t h\u1EA1 k\xEDch th\xEDch c\u1EA7u B\u0110S" },
  { ticker: "VCB", name: "Vietcombank", sector: "Ng\xE2n h\xE0ng", price: 61400, pe: 12.8, roe: 20.2, dividendYield: 3.2, payoutRatio: 20, debtEquity: 0.9, growth: 13.1, marketCap: "Large", eps: 4797, fscore: 8, grossMargin: 48, pros: ["Ng\xE2n h\xE0ng qu\u1ED1c doanh l\u1EDBn nh\u1EA5t", "Ch\u1EA5t l\u01B0\u1EE3ng t\xE0i s\u1EA3n t\u1ED1t nh\u1EA5t h\u1EC7 th\u1ED1ng", "D\xF2ng ti\u1EC1n ngo\u1EA1i t\u1EC7 m\u1EA1nh"], cons: ["Room ngo\u1EA1i 0.4% \u2014 kh\xF3 mua th\xEAm", "C\u1ED5 t\u1EE9c th\u1EA5p do gi\u1EEF l\u1EA1i v\u1ED1n"], technicalTrend: "Neutral", rsi: 50, revenueGrowthQtr: 12, institutionalHold: 74.8, exDividendDate: "20/07/2026", paymentDate: "15/08/2026", dividendAmount: 2e3, catalystScore: 7, newsSentiment: "Positive", sectorWaveScore: 7.2, agmDate: "26/04/2026", agmAgenda: "Tr\xECnh ph\u01B0\u01A1ng \xE1n t\u0103ng t\u1EF7 l\u1EC7 c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t sau khi \u0111\u01B0\u1EE3c NHNN ph\xEA duy\u1EC7t", insiderStatus: "Nh\xE0 n\u01B0\u1EDBc s\u1EDF h\u1EEFu 74.8%, ngo\u1EA1i t\u1EC7 USD ph\xF2ng th\u1EE7 cao", macroCatalyst: "T\u0103ng v\u1ED1n Tier 1 t\u1EEB k\u1EBF ho\u1EA1ch ph\xE1t h\xE0nh c\u1ED5 ph\u1EA7n m\u1EDBi", globalIndicator: "L\xE3i su\u1EA5t USD & DXY", globalTrend: "T\xEDch c\u1EF1c \u2014 h\u1EA1 l\xE3i su\u1EA5t USD gi\u1EA3m \xE1p t\u1EF7 gi\xE1" }
];

// lib/cotuc/cotuc-universe.ts
function buildCotucUniverse(rows) {
  const core = new Map(DIVIDEND_STOCKS.map((s) => [s.ticker, s]));
  const byTicker = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const t = r.ticker?.trim().toUpperCase();
    if (t && /^[A-Z0-9]{3,10}$/.test(t) && !byTicker.has(t)) byTicker.set(t, r);
  }
  const mk = (t, r) => ({
    ticker: t,
    exchange: r?.exchange ?? null,
    sector: core.get(t)?.sector ?? r?.industry ?? r?.sector ?? null,
    sectorGroup: r?.sectorGroup ?? null,
    name: r?.name ?? core.get(t)?.name ?? null,
    avgValue20: r?.avgValue20 ?? null,
    core: core.has(t)
  });
  const head = DIVIDEND_STOCKS.map((s) => mk(s.ticker, byTicker.get(s.ticker)));
  const tail = [...byTicker.entries()].filter(([t]) => !core.has(t)).sort((a, b) => (b[1].avgValue20 ?? 0) - (a[1].avgValue20 ?? 0) || a[0].localeCompare(b[0])).map(([t, r]) => mk(t, r));
  return [...head, ...tail];
}
var cache = null;
var TTL_MS = 30 * 6e4;
async function getCotucUniverse({ fetchImpl = fetch, force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/scanner/universe`, { cache: "no-store", signal: AbortSignal.timeout(15e3) });
    if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
    const body = await res.json();
    const rows = Array.isArray(body.tickers) ? body.tickers : [];
    if (rows.length < 20) throw new Error(`Gateway tr\u1EA3 ${rows.length} m\xE3`);
    const value = { tickers: buildCotucUniverse(rows), source: "GATEWAY", builtAt: body.builtAt ?? null };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    const value = { tickers: buildCotucUniverse([]), source: "FALLBACK_17", builtAt: null, error: e instanceof Error ? e.message : String(e) };
    return cache?.value ?? value;
  }
}

// lib/cotuc/timing-v3/intraday.ts
function appendIntradayBar(series, q) {
  if (!q || !(q.price > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) return series;
  const last = series[series.length - 1];
  if (!last || q.date > last.date) return [...series, { date: q.date, adjClose: q.price }];
  if (q.date === last.date) return [...series.slice(0, -1), { date: q.date, adjClose: q.price }];
  return series;
}
async function fetchLiveQuotes(symbols, { fetchImpl = fetch } = {}) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < symbols.length; i += 50) {
    try {
      const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/quotes?symbols=${symbols.slice(i, i + 50).join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(15e3) });
      if (!res.ok) continue;
      const body = await res.json();
      for (const [sym, q] of Object.entries(body.quotes ?? {})) {
        const date = q.time?.slice(0, 10);
        if (typeof q.price === "number" && q.price > 0 && date) out.set(sym, { price: q.price, date });
      }
    } catch {
    }
  }
  return out;
}
async function fetchLiveIndex(code = "VNINDEX", { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/indices/${code}`, { cache: "no-store", signal: AbortSignal.timeout(1e4) });
    if (!res.ok) return null;
    const b = await res.json();
    return typeof b.value === "number" && b.value > 0 && b.date ? { price: b.value, date: b.date } : null;
  } catch {
    return null;
  }
}

// lib/market-data/yahoo-finance-adapter.ts
var YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
function toYahooSymbol(ticker) {
  const normalized = ticker.trim().toUpperCase();
  if (normalized === "VNINDEX" || normalized === "VN-INDEX") return "^VNINDEX.VN";
  if (ticker.startsWith("^") || ticker.includes(".")) return ticker;
  return `${ticker}.VN`;
}
async function fetchOhlcvHistory(ticker, range = "3mo") {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      return { success: false, data: null, error: `Yahoo Finance tra ve HTTP ${res.status} cho ma ${symbol}` };
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !Array.isArray(result.timestamp)) {
      const errMsg = json?.chart?.error?.description ?? "Khong nhan duoc du lieu hop le tu Yahoo Finance";
      return { success: false, data: null, error: `${errMsg} (ma: ${symbol})` };
    }
    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    const adjcloseArr = result.indicators?.adjclose?.[0]?.adjclose;
    if (!quote) {
      return { success: false, data: null, error: "Thieu truong indicators.quote trong response Yahoo" };
    }
    const bars = timestamps.map((t, i) => ({
      date: new Date(t * 1e3).toISOString().slice(0, 10),
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i],
      adjClose: adjcloseArr?.[i] ?? quote.close?.[i]
      // fallback ve close neu Yahoo thieu adjclose
    })).filter((bar) => bar.close !== null && bar.close !== void 0 && !Number.isNaN(bar.close));
    return { success: true, data: bars };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      data: null,
      error: isTimeout ? "Yahoo Finance khong phan hoi trong 10s (timeout)" : err instanceof Error ? err.message : String(err)
    };
  }
}

// lib/market-data/vndirect-adapter.ts
var VND_BASE_URL = "https://dchart-api.vndirect.com.vn/dchart/history";
async function fetchIndexOhlcvHistory(symbol, days = 90) {
  try {
    const to = Math.floor(Date.now() / 1e3);
    const from = to - days * 24 * 60 * 60;
    const url = `${VND_BASE_URL}?resource=stock&symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      return { success: false, data: null, error: `VNDirect dchart tra ve HTTP ${res.status} cho ma ${symbol}` };
    }
    const json = await res.json();
    if (json?.s !== "ok" || !Array.isArray(json?.t) || json.t.length === 0) {
      return { success: false, data: null, error: `VNDirect dchart khong co du lieu hop le cho ma ${symbol}` };
    }
    const bars = json.t.map((ts, i) => ({
      date: new Date(ts * 1e3).toISOString().slice(0, 10),
      open: json.o[i],
      high: json.h[i],
      low: json.l[i],
      close: json.c[i],
      volume: json.v[i]
    }));
    return { success: true, data: bars };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      data: null,
      error: isTimeout ? "VNDirect dchart khong phan hoi trong 10s (timeout)" : err instanceof Error ? err.message : String(err)
    };
  }
}

// lib/cotuc/vndirect-finfo-adapter.ts
var BASE = "https://api-finfo.vndirect.com.vn/v4";
var UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
var ITEM_REVENUE = 21001;
var ITEM_NPAT_PARENT = 23e3;
async function getJson(url, fetchImpl, timeoutMs = 15e3) {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`VNDirect HTTP ${res.status}`);
  return res.json();
}
function parseVndEvents(rows) {
  const day = (s) => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  const cash = /* @__PURE__ */ new Map();
  const shares = /* @__PURE__ */ new Map();
  const meetings = /* @__PURE__ */ new Set();
  for (const e of rows) {
    if (e.locale && e.locale !== "VN") continue;
    const d = day(e.effectiveDate);
    if (!d) continue;
    if (e.type === "DIVIDEND" && typeof e.dividend === "number" && e.dividend > 0) {
      const k = `${d}`;
      const prev = cash.get(k);
      cash.set(k, { exDate: d, valuePerShare: (prev?.valuePerShare ?? 0) + e.dividend, note: e.note ?? null });
    } else if ((e.type === "STOCKDIV" || e.type === "KINDDIV") && typeof e.ratio === "number" && e.ratio > 0) {
      const k = `${d}:${e.type}`;
      shares.set(k, { exDate: d, ratio: e.ratio / 100, kind: e.type, note: e.note ?? null });
    } else if (e.type === "MEETING") {
      meetings.add(d);
    }
  }
  const byDate = (a, b) => a.exDate.localeCompare(b.exDate);
  return { cash: [...cash.values()].sort(byDate), shares: [...shares.values()].sort(byDate), meetings: [...meetings].sort() };
}
async function fetchVndCorporateActions(ticker, { fetchImpl = fetch } = {}) {
  try {
    const url = `${BASE}/events?q=code:${encodeURIComponent(ticker)}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING&sort=effectiveDate:desc&size=500`;
    const json = await getJson(url, fetchImpl);
    return { ok: true, ...parseVndEvents(json.data ?? []) };
  } catch (e) {
    return { ok: false, cash: [], shares: [], meetings: [], error: e instanceof Error ? e.message : String(e) };
  }
}
function parseVndStatements(rows) {
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.reportType && r.reportType !== "QUARTER") continue;
    const fd = r.fiscalDate?.slice(0, 10);
    if (!fd || !/^\d{4}-\d{2}-\d{2}$/.test(fd)) continue;
    const month = Number(fd.slice(5, 7));
    if (![3, 6, 9, 12].includes(month)) continue;
    const q = by.get(fd) ?? { year: Number(fd.slice(0, 4)), quarter: month / 3, fiscalDate: fd, announceDate: null, revenue: null, netProfit: null };
    const created = r.createdDate?.slice(0, 10) ?? null;
    const lag = created ? (Date.parse(created) - Date.parse(fd)) / 864e5 : NaN;
    if (created && lag >= 1 && lag <= 120 && (!q.announceDate || created < q.announceDate)) q.announceDate = created;
    if (r.itemCode === ITEM_REVENUE && typeof r.numericValue === "number") q.revenue = r.numericValue;
    if (r.itemCode === ITEM_NPAT_PARENT && typeof r.numericValue === "number") q.netProfit = r.numericValue;
    by.set(fd, q);
  }
  return [...by.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
}
async function fetchVndQuarterlyFinancials(ticker, { fetchImpl = fetch } = {}) {
  try {
    const url = `${BASE}/financial_statements?q=code:${encodeURIComponent(ticker)}~reportType:QUARTER~itemCode:${ITEM_REVENUE},${ITEM_NPAT_PARENT}&size=200&sort=fiscalDate:desc`;
    const json = await getJson(url, fetchImpl);
    const quarters = parseVndStatements(json.data ?? []);
    return { available: quarters.length > 0, quarters, error: quarters.length ? void 0 : "VNDirect kh\xF4ng c\xF3 BCTC qu\xFD" };
  } catch (e) {
    return { available: false, quarters: [], error: e instanceof Error ? e.message : String(e) };
  }
}
function vndEventsToVciShape(rows) {
  const day = (s) => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const e of rows) {
    if (e.locale && e.locale !== "VN") continue;
    const eff = day(e.effectiveDate);
    if (!eff) continue;
    const key = `${e.type}:${eff}:${e.dividend ?? ""}:${e.ratio ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = { publicDate: day(e.disclosureDate), recordDate: null, listingDate: null, source: "VNDIRECT" };
    if (e.type === "DIVIDEND" && typeof e.dividend === "number" && e.dividend > 0) {
      out.push({
        ...base,
        eventCode: "DIV",
        exrightDate: eff,
        issueDate: null,
        payoutDate: day(e.actualDate),
        eventTitleVi: e.note || `C\u1ED5 t\u1EE9c b\u1EB1ng ti\u1EC1n ${e.dividend.toLocaleString("vi-VN")} \u0111/cp`,
        valuePerShare: e.dividend,
        exerciseRatio: null
      });
    } else if ((e.type === "STOCKDIV" || e.type === "KINDDIV") && typeof e.ratio === "number" && e.ratio > 0) {
      const title = e.type === "STOCKDIV" ? "C\u1ED5 t\u1EE9c b\u1EB1ng c\u1ED5 phi\u1EBFu" : "C\u1ED5 phi\u1EBFu th\u01B0\u1EDFng";
      out.push({
        ...base,
        eventCode: "ISS",
        exrightDate: eff,
        issueDate: null,
        payoutDate: null,
        eventTitleVi: `${title}${e.note ? ` \u2014 ${e.note}` : ""}`,
        valuePerShare: null,
        exerciseRatio: e.ratio / 100
      });
    } else if (e.type === "MEETING") {
      out.push({
        ...base,
        eventCode: "AGME",
        exrightDate: null,
        issueDate: eff,
        payoutDate: null,
        eventTitleVi: e.note || e.typeDesc || "H\u1ECDp \u0110H\u0110C\u0110",
        valuePerShare: null,
        exerciseRatio: null
      });
    }
  }
  return out;
}
async function fetchVndEventsVciShape(ticker, from, to, { fetchImpl = fetch } = {}) {
  try {
    const q = `code:${encodeURIComponent(ticker)}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING~effectiveDate:gte:${from}~effectiveDate:lte:${to}`;
    const json = await getJson(`${BASE}/events?q=${q}&sort=effectiveDate:desc&size=300`, fetchImpl);
    return { ok: true, events: vndEventsToVciShape(json.data ?? []) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// lib/cotuc/vci-events-adapter.ts
var IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";
function toDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function sortEventsByRelevance(events) {
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.exerciseDate !== null && e.exerciseDate >= todayStr).sort((a, b) => a.exerciseDate.localeCompare(b.exerciseDate));
  const past = events.filter((e) => e.exerciseDate !== null && e.exerciseDate < todayStr).sort((a, b) => b.exerciseDate.localeCompare(a.exerciseDate));
  const noDate = events.filter((e) => e.exerciseDate === null);
  return [...upcoming, ...past, ...noDate];
}
function toResult(ticker, rawEvents, source) {
  const events = rawEvents.map((e) => ({
    eventCode: e.eventCode ?? "",
    publicDate: toDateOnly(e.publicDate),
    exerciseDate: toDateOnly(e.exrightDate ?? e.issueDate ?? null),
    eventTitle: e.eventTitleVi ?? e.eventTitleEn ?? null,
    ratio: e.exerciseRatio !== void 0 && e.exerciseRatio !== null ? String(e.exerciseRatio) : null,
    settlementDate: toDateOnly(e.payoutDate ?? e.listingDate ?? null)
  }));
  return {
    ticker,
    available: true,
    source,
    exDividendEvents: sortEventsByRelevance(events.filter((e) => e.eventCode === "DIV")),
    agmEvents: sortEventsByRelevance(events.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode))),
    rawEvents
  };
}
async function fetchDividendEvents(ticker, monthsBack = 60, monthsForward = 6) {
  const now = /* @__PURE__ */ new Date();
  const fromD = new Date(now);
  fromD.setMonth(fromD.getMonth() - monthsBack);
  const toD = new Date(now);
  toD.setMonth(toD.getMonth() + monthsForward);
  const vnd = await fetchVndEventsVciShape(ticker, fromD.toISOString().slice(0, 10), toD.toISOString().slice(0, 10));
  if (vnd.ok) return toResult(ticker, vnd.events, "VNDIRECT");
  const vci = await fetchDividendEventsVci(ticker, monthsBack, monthsForward);
  return vci.available ? vci : { ...vci, error: `VNDirect: ${vnd.error}; ${vci.error ?? ""}` };
}
async function fetchDividendEventsVci(ticker, monthsBack, monthsForward) {
  try {
    const now = /* @__PURE__ */ new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - monthsBack);
    const to = new Date(now);
    to.setMonth(to.getMonth() + monthsForward);
    const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "");
    const toStr = to.toISOString().slice(0, 10).replace(/-/g, "");
    const url = `${IQ_BASE_URL}/v1/events?ticker=${ticker}&fromDate=${fromStr}&toDate=${toStr}&eventCode=DIV,ISS,AGME,AGMR,EGME&page=0&size=100`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store"
    });
    if (!res.ok) {
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: `VCI HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Kh\xF4ng r\xF5 nguy\xEAn nh\xE2n";
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: `VCI b\xE1o l\u1ED7i: ${String(reason).slice(0, 150)}` };
    }
    const rawEvents = json?.data?.content ?? (Array.isArray(json?.data) ? json.data : []);
    return toResult(ticker, rawEvents, "VCI");
  } catch (err) {
    return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// lib/cotuc/dividend-lifecycle.ts
function classifyIssEvent(eventTitleVi) {
  const t = eventTitleVi.toLowerCase();
  if (t.includes("c\u1ED5 t\u1EE9c b\u1EB1ng c\u1ED5 phi\u1EBFu")) return "STOCK_DIVIDEND";
  if (t.includes("cbcnv")) return "ESOP";
  if (t.includes("c\u1ED5 phi\u1EBFu th\u01B0\u1EDFng")) return "BONUS_ISSUE";
  return "BONUS_ISSUE";
}
function buildLifecycleEvents(ticker, rawEvents) {
  const agmEvents = rawEvents.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode));
  function findNearestAgmBefore(publicDate) {
    if (!publicDate) return null;
    const targetTime = new Date(publicDate).getTime();
    const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1e3;
    let best = null;
    for (const agm of agmEvents) {
      const agmDateStr = agm.issueDate ?? agm.exrightDate ?? null;
      if (!agmDateStr) continue;
      const agmTime = new Date(agmDateStr).getTime();
      const diff = targetTime - agmTime;
      if (diff >= 0 && diff <= SIX_MONTHS_MS) {
        if (!best || diff < best.diff) best = { date: agmDateStr, diff };
      }
    }
    return best?.date ?? null;
  }
  const divAndIssEvents = rawEvents.filter((e) => e.eventCode === "DIV" || e.eventCode === "ISS");
  return divAndIssEvents.map((e) => {
    const eventType = e.eventCode === "DIV" ? "CASH" : classifyIssEvent(e.eventTitleVi ?? "");
    const publicDate = e.publicDate ?? null;
    const settlementDate = e.payoutDate ?? e.listingDate ?? null;
    return {
      ticker,
      eventType,
      eventTitleVi: e.eventTitleVi ?? "",
      publicDate,
      agmDate: findNearestAgmBefore(publicDate),
      exrightDate: e.exrightDate ?? null,
      recordDate: e.recordDate ?? null,
      settlementDate,
      valuePerShare: eventType === "CASH" ? e.valuePerShare ?? null : null,
      exerciseRatio: eventType !== "CASH" ? e.exerciseRatio ?? null : null
    };
  });
}

// lib/cotuc/timing-v3/date-utils.ts
var MAX_SPAN_CALENDAR_DAYS = 400;
function toDayNumber(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t / 864e5;
}
function dayNumberToIso(dayNumber) {
  return new Date(dayNumber * 864e5).toISOString().slice(0, 10);
}
function tradingDaysBetween(from, to, cal) {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  if (a === null || b === null) return null;
  if (Math.abs(b - a) > MAX_SPAN_CALENDAR_DAYS) return null;
  if (a === b) return 0;
  const step = b > a ? 1 : -1;
  let n = 0;
  for (let d = a + step; step > 0 ? d <= b : d >= b; d += step) {
    if (cal.isTradingDay(d)) n += step;
  }
  return n;
}
function makeTradingCalendarFromPrices(priceDates) {
  const set = /* @__PURE__ */ new Set();
  for (const d of priceDates) {
    const n = toDayNumber(d);
    if (n !== null) set.add(n);
  }
  return {
    isTradingDay(dayNumber) {
      return set.has(dayNumber);
    }
  };
}

// lib/cotuc/timing-v3/seasonality/beta-binomial.ts
var LANCZOS_G = 7;
var LANCZOS_COEFFICIENTS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9984369578019572e-21,
  15056327351493116e-23
];
function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const xx = x - 1;
  let a = LANCZOS_COEFFICIENTS[0];
  const t = xx + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_COEFFICIENTS[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}
function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}
var MAX_CF_ITER = 200;
var CF_EPS = 1e-14;
var TINY = 1e-300;
function betaContinuedFraction(x, a, b) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_CF_ITER; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < CF_EPS) break;
  }
  return h;
}
function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) throw new Error("regularizedIncompleteBeta: a v\xE0 b ph\u1EA3i d\u01B0\u01A1ng");
  const logFront = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b);
  const front = Math.exp(logFront);
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaContinuedFraction(x, a, b) / a;
  }
  return 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}
function invertRegularizedIncompleteBeta(p, a, b, tolerance = 1e-10) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < tolerance) return mid;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function betaBinomialPosterior(wins, losses, alpha0 = 1, beta0 = 1, level = 0.9) {
  if (wins < 0 || losses < 0) throw new Error("betaBinomialPosterior: wins/losses kh\xF4ng \u0111\u01B0\u1EE3c \xE2m");
  if (alpha0 <= 0 || beta0 <= 0) throw new Error("betaBinomialPosterior: alpha0/beta0 ph\u1EA3i d\u01B0\u01A1ng");
  const alpha = alpha0 + wins;
  const beta = beta0 + losses;
  const mean = alpha / (alpha + beta);
  const lo = invertRegularizedIncompleteBeta((1 - level) / 2, alpha, beta);
  const hi = invertRegularizedIncompleteBeta((1 + level) / 2, alpha, beta);
  return { alpha, beta, mean, ci: [lo, hi], level };
}
function estimatePriorFromRates(rates, priorStrength = 10) {
  const clean = rates.filter((r) => Number.isFinite(r) && r >= 0 && r <= 1);
  if (clean.length === 0) return { alpha0: 1, beta0: 1 };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (clean.length === 1) return { alpha0: mean * priorStrength, beta0: (1 - mean) * priorStrength };
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length - 1);
  const impliedStrength = variance > 1e-9 ? Math.max(0, mean * (1 - mean) / variance - 1) : priorStrength;
  const strength = Math.min(priorStrength, Math.max(2, impliedStrength));
  return { alpha0: Math.max(mean * strength, 1e-6), beta0: Math.max((1 - mean) * strength, 1e-6) };
}

// lib/cotuc/timing-v3/decision/market-regime.ts
function simpleMovingAverage(values, window) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}
function realizedVolatility(closes, window) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const out = new Array(closes.length).fill(null);
  for (let i = window; i <= rets.length; i++) {
    const slice = rets.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1 || 1);
    out[i] = Math.sqrt(variance);
  }
  return out;
}
function percentileRankOfLast(history) {
  const clean = history.filter((v) => v !== null && Number.isFinite(v));
  if (clean.length < 2) return null;
  const last = clean[clean.length - 1];
  const rest = clean.slice(0, -1);
  const below = rest.filter((v) => v <= last).length;
  return below / rest.length;
}
function classifyMarketRegime(input) {
  const maWindow = input.maWindow ?? 200;
  const volWindow = input.volatilityWindow ?? 20;
  const volLookback = input.volatilityLookback ?? 252;
  const highPct = input.volatilityHighPercentile ?? 0.8;
  const closes = input.closes;
  const reasons = [];
  if (closes.length < maWindow) {
    return { regime: "NEUTRAL", belowMa: null, currentVolatility: null, volatilityPercentile: null, reasons: ["Ch\u01B0a \u0111\u1EE7 d\u1EEF li\u1EC7u \u0111\u1EC3 t\xEDnh MA \u2014 m\u1EB7c \u0111\u1ECBnh trung t\xEDnh, kh\xF4ng l\u1EA1c quan c\u0169ng kh\xF4ng bi quan"] };
  }
  const ma = simpleMovingAverage(closes, maWindow);
  const lastMa = ma[ma.length - 1];
  const lastClose = closes[closes.length - 1];
  const belowMa = lastMa !== null ? lastClose < lastMa : null;
  if (belowMa) reasons.push(`Gi\xE1 \u0111\xF3ng c\u1EEDa d\u01B0\u1EDBi MA${maWindow}`);
  const vol = realizedVolatility(closes, volWindow);
  const currentVolatility = vol[vol.length - 1];
  const volHistory = vol.slice(-Math.min(volLookback, vol.length)).filter((v) => v !== null);
  const volatilityPercentile = currentVolatility !== null ? percentileRankOfLast(volHistory) : null;
  const highVol = volatilityPercentile !== null && volatilityPercentile >= highPct;
  if (highVol) reasons.push(`Bi\u1EBFn \u0111\u1ED9ng th\u1EF1c hi\u1EC7n \u1EDF ph\xE2n v\u1ECB ${Math.round((volatilityPercentile ?? 0) * 100)}% (\u2265 ng\u01B0\u1EE1ng ${Math.round(highPct * 100)}%)`);
  let regime;
  if (belowMa && highVol) regime = "RISK_OFF";
  else if (belowMa || highVol) regime = "RISK_OFF";
  else regime = "RISK_ON";
  if (regime === "RISK_ON") reasons.push(`Gi\xE1 tr\xEAn MA${maWindow}, bi\u1EBFn \u0111\u1ED9ng \u1EDF m\u1EE9c b\xECnh th\u01B0\u1EDDng`);
  return { regime, belowMa, currentVolatility, volatilityPercentile, reasons };
}
var REGIME_WEIGHT_MULTIPLIER = {
  RISK_ON: 1,
  NEUTRAL: 0.85,
  RISK_OFF: 0.55
};

// lib/cotuc/timing-v3/decision/log-odds-combiner.ts
var EPS = 1e-6;
function clampProb(p) {
  return Math.min(1 - EPS, Math.max(EPS, p));
}
function logit(p) {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}
function invLogit(x) {
  return 1 / (1 + Math.exp(-x));
}
function combineLogOdds(signals, options = {}) {
  const shrinkTo = options.shrinkTo ?? 0.5;
  const shrinkStrength = options.shrinkStrength ?? 4;
  const valid = signals.filter((s) => s.probability !== null && s.weight > 0);
  const totalWeight = valid.reduce((a, s) => a + s.weight, 0);
  if (valid.length === 0 || totalWeight <= 0) {
    return { probability: shrinkTo, probabilityBeforeShrink: shrinkTo, contributions: [], totalWeight: 0 };
  }
  const baseLogit = logit(shrinkTo);
  const contributions = valid.map((s) => ({
    name: s.name,
    probability: s.probability,
    weight: s.weight,
    logOdds: logit(s.probability),
    share: s.weight / totalWeight
  }));
  const meanWeight = totalWeight / valid.length;
  const summedDelta = contributions.reduce((a, c) => a + c.weight * (c.logOdds - baseLogit), 0) / meanWeight;
  const rawLogit = baseLogit + summedDelta;
  const probabilityBeforeShrink = invLogit(rawLogit);
  const alpha = totalWeight / (totalWeight + shrinkStrength);
  const shrunkLogit = baseLogit + alpha * (rawLogit - baseLogit);
  const probability = invLogit(shrunkLogit);
  return { probability, probabilityBeforeShrink, contributions, totalWeight };
}

// lib/cotuc/timing-v3/decision/entry-refinement.ts
function buildStagedEntryPlan(entryFrom, entryTo, tranches = 3) {
  if (!(tranches >= 1) || !Number.isInteger(tranches)) throw new Error("buildStagedEntryPlan: tranches ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn \u2265 1");
  if (entryFrom > entryTo) throw new Error("buildStagedEntryPlan: entryFrom ph\u1EA3i \u2264 entryTo");
  const span = entryTo - entryFrom;
  const fraction = 1 / tranches;
  const offsets = [];
  for (let i = 0; i < tranches; i++) {
    const t = tranches === 1 ? 0 : i / (tranches - 1);
    offsets.push(Math.round(entryFrom + t * span));
  }
  return offsets.map((offset) => ({ offset, fraction }));
}
function checkRunTooFar(point, currentValue, thresholdPercentile = 0.7) {
  if (!point || point.p5 === null || point.p25 === null || point.p75 === null || point.p95 === null) {
    return { percentile: null, hasRunTooFar: false };
  }
  const anchors = [
    [point.p5, 0.05],
    [point.p25, 0.25],
    [point.p75, 0.75],
    [point.p95, 0.95]
  ];
  let percentile;
  if (currentValue <= anchors[0][0]) percentile = anchors[0][1];
  else if (currentValue >= anchors[3][0]) percentile = anchors[3][1];
  else {
    let lo = anchors[0];
    let hi = anchors[3];
    for (let i = 1; i < anchors.length; i++) {
      if (currentValue <= anchors[i][0]) {
        hi = anchors[i];
        lo = anchors[i - 1];
        break;
      }
    }
    const t = hi[0] === lo[0] ? 0 : (currentValue - lo[0]) / (hi[0] - lo[0]);
    percentile = lo[1] + t * (hi[1] - lo[1]);
  }
  return { percentile, hasRunTooFar: percentile >= thresholdPercentile };
}
function computeInvalidationLevel(entryPrice, atr, atrMultiple = 2) {
  if (entryPrice <= 0) throw new Error("computeInvalidationLevel: entryPrice ph\u1EA3i d\u01B0\u01A1ng");
  if (atr < 0) throw new Error("computeInvalidationLevel: atr kh\xF4ng \u0111\u01B0\u1EE3c \xE2m");
  return entryPrice - atr * atrMultiple;
}
function isInvalidated(currentPrice, invalidationLevel) {
  return currentPrice <= invalidationLevel;
}
function isTimeStopped(currentOffset, exitOffset) {
  return currentOffset > exitOffset;
}
function buildEntryPlanSummary(input) {
  const tranches = buildStagedEntryPlan(input.entryFrom, input.entryTo, input.tranches ?? 3);
  const runTooFar = input.currentCarValue !== void 0 ? checkRunTooFar(input.curvePointAtCurrentOffset, input.currentCarValue, input.runTooFarThreshold ?? 0.7) : { percentile: null, hasRunTooFar: false };
  const invalidationLevel = input.entryPrice !== void 0 && input.atr !== void 0 ? computeInvalidationLevel(input.entryPrice, input.atr, input.atrMultiple ?? 2) : null;
  const invalidated = invalidationLevel !== null && input.currentPrice !== void 0 ? isInvalidated(input.currentPrice, invalidationLevel) : false;
  const timeStopped = isTimeStopped(input.currentOffset, input.exitOffset);
  return {
    tranches,
    runTooFar,
    invalidationLevel,
    invalidated,
    timeStopped,
    pauseFurtherEntries: runTooFar.hasRunTooFar || invalidated || timeStopped
  };
}

// lib/cotuc/timing-v3/decision/compute-decision-state.ts
var DEFAULT_DECISION_THRESHOLDS = { favorableProbability: 0.6, watchProbability: 0.5 };
var ACTION_TEXT = {
  NO_DATE: "Ch\u01B0a c\xF3 ng\xE0y s\u1EF1 ki\u1EC7n",
  POST_EX: "\u0110\xE3 qua s\u1EF1 ki\u1EC7n",
  NO_SIGNAL: "Ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng th\u1ED1ng k\xEA",
  TOO_EARLY: "Ch\u01B0a t\u1EDBi v\xF9ng mua",
  IN_WINDOW: "\u0110ang trong v\xF9ng mua",
  WINDOW_PASSED: "\u0110\xE3 qua v\xF9ng mua"
};
function pct(v) {
  return `${Math.round(v * 100)}%`;
}
var HARD_AVOID_ACTIONS = /* @__PURE__ */ new Set(["NO_DATE", "POST_EX", "NO_SIGNAL", "WINDOW_PASSED"]);
function computeDecisionState(input, thresholds = DEFAULT_DECISION_THRESHOLDS) {
  const { action, combined, entryPlan, marketRegime, dateStatus, earningsConflict, liquidityOk } = input;
  const p = combined.probability;
  const checks = [
    {
      key: "inWindow",
      label: "\u0110ang trong v\xF9ng mua",
      passed: action === "IN_WINDOW",
      detail: ACTION_TEXT[action]
    },
    {
      key: "probability",
      label: "X\xE1c su\u1EA5t t\u1ED5ng h\u1EE3p \u0111\u1EE7 cao",
      // null ở đây nghĩa là "chưa rõ ràng" (nằm giữa hai ngưỡng watch/favorable), không phải
      // "thiếu dữ liệu" như các check khác — cả hai đều hiển thị trung tính trên UI nên dùng
      // chung kiểu boolean|null là hợp lý, chi tiết thật nằm ở `detail`.
      passed: p >= thresholds.favorableProbability ? true : p >= thresholds.watchProbability ? null : false,
      detail: `${pct(p)} (t\u1EEB ${combined.contributions.length} t\xEDn hi\u1EC7u, tr\u1ECDng s\u1ED1 ${combined.totalWeight.toFixed(1)})`
    },
    {
      key: "notRunTooFar",
      label: "Gi\xE1 ch\u01B0a ch\u1EA1y tr\u01B0\u1EDBc qu\xE1 xa",
      passed: entryPlan.runTooFar.percentile === null ? null : !entryPlan.runTooFar.hasRunTooFar,
      detail: entryPlan.runTooFar.percentile === null ? "Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u l\u1ECBch s\u1EED \u0111\u1EC3 so s\xE1nh" : `\u1EDE ph\xE2n v\u1ECB ${pct(entryPlan.runTooFar.percentile)} so v\u1EDBi c\xE1c \u0111\u1EE3t tr\u01B0\u1EDBc`
    },
    {
      key: "notInvalidated",
      label: "Ch\u01B0a ch\u1EA1m m\u1EE9c v\xF4 hi\u1EC7u ho\xE1 / h\u1EBFt th\u1EDDi gian",
      passed: !entryPlan.invalidated && !entryPlan.timeStopped,
      detail: entryPlan.invalidated ? "\u0110\xE3 th\u1EE7ng m\u1EE9c v\xF4 hi\u1EC7u ho\xE1 (ATR)" : entryPlan.timeStopped ? "\u0110\xE3 qua \u0111i\u1EC3m tho\xE1t d\u1EF1 ki\u1EBFn" : "C\xF2n trong th\u1EDDi gian h\u1EE3p l\u1EC7"
    },
    {
      key: "dateConfirmed",
      label: "Ng\xE0y s\u1EF1 ki\u1EC7n \u0111\xE3 x\xE1c nh\u1EADn",
      passed: dateStatus === null ? null : dateStatus === "CONFIRMED",
      detail: dateStatus === null ? "Ch\u01B0a c\xF3 th\xF4ng tin" : dateStatus === "CONFIRMED" ? "\u0110\xE3 x\xE1c nh\u1EADn" : "Ch\u1EC9 m\u1EDBi c\xF4ng b\u1ED1/\u01B0\u1EDBc t\xEDnh, c\xF3 th\u1EC3 \u0111\u1ED5i"
    },
    {
      key: "noEarningsConflict",
      label: "Kh\xF4ng xung \u0111\u1ED9t KQKD",
      passed: earningsConflict === "NONE",
      detail: earningsConflict === "NONE" ? "Kh\xF4ng c\xF3" : earningsConflict === "NEAR_EX" ? "KQKD d\u1EF1 ki\u1EBFn s\xE1t ng\xE0y s\u1EF1 ki\u1EC7n" : "KQKD r\u01A1i v\xE0o th\u1EDDi gian n\u1EAFm gi\u1EEF"
    },
    {
      key: "marketRegime",
      label: "Th\u1ECB tr\u01B0\u1EDDng chung kh\xF4ng x\u1EA5u",
      passed: marketRegime !== "RISK_OFF",
      detail: marketRegime === "RISK_ON" ? "Thu\u1EADn l\u1EE3i" : marketRegime === "NEUTRAL" ? "Trung t\xEDnh" : "\u0110ang ph\xF2ng th\u1EE7 (d\u01B0\u1EDBi MA d\xE0i h\u1EA1n ho\u1EB7c bi\u1EBFn \u0111\u1ED9ng cao)"
    },
    {
      key: "liquidity",
      label: "Thanh kho\u1EA3n \u0111\u1EE7",
      passed: liquidityOk,
      detail: liquidityOk === null ? "Ch\u01B0a ki\u1EC3m tra" : liquidityOk ? "\u0110\u1EE7" : "Th\u1EA5p \u2014 kh\xF3 v\xE0o/ra \u1EDF kh\u1ED1i l\u01B0\u1EE3ng d\u1EF1 ki\u1EBFn"
    }
  ];
  const hardAvoid = HARD_AVOID_ACTIONS.has(action) || entryPlan.timeStopped || entryPlan.invalidated;
  let level;
  if (hardAvoid || p < thresholds.watchProbability) {
    level = "AVOID";
  } else if (action === "IN_WINDOW" && p >= thresholds.favorableProbability && checks.every((c) => c.key === "liquidity" || c.passed !== false)) {
    level = "FAVORABLE";
  } else {
    level = "WATCH";
  }
  const failedMandatory = checks.filter((c) => c.key !== "liquidity" && c.passed === false);
  const headline = level === "FAVORABLE" ? `Thu\u1EADn l\u1EE3i \u0111\u1EC3 v\xE0o \u2014 x\xE1c su\u1EA5t t\u1ED5ng h\u1EE3p ${pct(p)}` : level === "WATCH" ? failedMandatory.length > 0 ? `Quan s\xE1t \u2014 c\xF2n thi\u1EBFu: ${failedMandatory.map((c) => c.label).join(", ")}` : "Quan s\xE1t \u2014 ch\u01B0a \u0111\u1EE7 \u0111i\u1EC1u ki\u1EC7n thu\u1EADn l\u1EE3i" : `Ch\u01B0a n\xEAn v\xE0o \u2014 ${ACTION_TEXT[action]}`;
  return { level, headline, checks, combinedProbability: p, disclaimer: "NOT_INVESTMENT_ADVICE" };
}

// lib/cotuc/timing-v3/decision/optimize-dividend-timing.ts
var DEFAULT_ENGINE_CONFIG = { conflictWindowTd: 3, minEventsForHigh: 12, minEventsForMedium: 8 };
var downgrade = (c) => c === "HIGH" ? "MEDIUM" : "LOW";
var UNKNOWN_IMPACT = {
  expectedAnnounce: null,
  announceMethod: null,
  tdToEarnings: null,
  conflict: "NONE",
  scoreDelta: null,
  stance: "UNKNOWN",
  reasons: []
};
function resolveEarningsImpact(input, deps) {
  const cfg = deps.cfg ?? DEFAULT_ENGINE_CONFIG;
  const { earnings, tdToEx, window } = input;
  if (!earnings) return UNKNOWN_IMPACT;
  const ann = earnings.expectedAnnounce;
  const tdToEarn = tradingDaysBetween(deps.today, ann.date, deps.cal);
  if (tdToEarn === null || tdToEarn < 0) return { ...UNKNOWN_IMPACT, expectedAnnounce: ann.date, announceMethod: ann.method };
  const width = cfg.conflictWindowTd + Math.round((ann.lagStdDays ?? 0) / 2);
  const reasons = [];
  let conflict = "NONE";
  if (tdToEx !== null) {
    const gap = Math.abs(tdToEx - tdToEarn);
    if (gap <= width) {
      conflict = "NEAR_EX";
      reasons.push(`KQKD d\u1EF1 ki\u1EBFn c\xE1ch GDKHQ ${gap} ng\xE0y giao d\u1ECBch (ng\u01B0\u1EE1ng ${width})`);
    } else if (window && window.exitOffset >= window.entryTo) {
      const earnOffset = tdToEarn - tdToEx;
      if (earnOffset >= window.entryTo && earnOffset <= window.exitOffset) {
        conflict = "INSIDE_HOLD";
        reasons.push("KQKD d\u1EF1 ki\u1EBFn r\u01A1i v\xE0o th\u1EDDi gian n\u1EAFm gi\u1EEF");
      }
    }
  }
  let scoreDelta = null;
  if (earnings.sue !== null && earnings.quality === "OK") scoreDelta = Math.max(-2, Math.min(2, earnings.sue / 2));
  let stance = "NEUTRAL";
  if (conflict === "NEAR_EX") stance = "AVOID";
  else if (conflict === "INSIDE_HOLD") stance = "REDUCE_SIZE";
  else if (scoreDelta !== null && scoreDelta >= 1 && tdToEarn <= 7) stance = "FAVORABLE";
  else if (scoreDelta === null) stance = "UNKNOWN";
  if (ann.method === "DEADLINE_ONLY") reasons.push("Ng\xE0y c\xF4ng b\u1ED1 ch\u1EC9 \u01B0\u1EDBc theo h\u1EA1n ph\xE1p l\xFD");
  return { expectedAnnounce: ann.date, announceMethod: ann.method, tdToEarnings: tdToEarn, conflict, scoreDelta, stance, reasons };
}
function selectedWindow(stats) {
  if (!stats || stats.selectedWindowId === null) return null;
  const w = stats.windows.find((x) => x.id === stats.selectedWindowId);
  return w && w.selected ? w : null;
}
function optimizeDividendTiming(input, deps) {
  const cfg = deps.cfg ?? DEFAULT_ENGINE_CONFIG;
  const tdToEx = tradingDaysBetween(deps.today, input.exDate?.value, deps.cal);
  const k = tdToEx === null ? null : -tdToEx;
  const win = selectedWindow(input.cycle);
  const earningsImpact = resolveEarningsImpact({ earnings: input.earnings, tdToEx, window: win }, deps);
  const base = { tdToEx, earningsImpact, dateStatus: input.exDate?.status ?? null };
  const empty = { window: null, expectedNetReturn: null, nEvents: null, confidence: null };
  if (tdToEx === null) return { action: "NO_DATE", ...empty, ...base };
  const postExWindowLive = win !== null && win.entryFrom > 0 && k <= win.exitOffset;
  if (tdToEx < 0 && !postExWindowLive) return { action: "POST_EX", ...empty, ...base };
  if (!win) return { action: "NO_SIGNAL", ...empty, ...base };
  let action;
  if (k < win.entryFrom) action = "TOO_EARLY";
  else if (k <= win.entryTo) action = "IN_WINDOW";
  else action = "WINDOW_PASSED";
  let confidence = win.nEvents >= cfg.minEventsForHigh && (win.oosMeanNet ?? -1) > 0 ? "HIGH" : win.nEvents >= cfg.minEventsForMedium ? "MEDIUM" : "LOW";
  if (input.exDate?.status !== "CONFIRMED") confidence = downgrade(confidence);
  if (earningsImpact.conflict !== "NONE") confidence = downgrade(confidence);
  return {
    action,
    window: { id: win.id, label: win.label, entryFrom: win.entryFrom, entryTo: win.entryTo, exitOffset: win.exitOffset, holdsThroughEx: win.holdsThroughEx },
    expectedNetReturn: win.netExpectancyLcb,
    nEvents: win.nEvents,
    confidence,
    ...base
  };
}
function estimateDividendFrequency(exDates) {
  const days = exDates.map(toDayNumber).filter((d) => d !== null).sort((a, b) => a - b);
  if (days.length < 3) return null;
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median3 = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  const cv = mean > 0 ? sd / mean : Infinity;
  const confidence = Math.max(0, Math.min(1, 1 - cv)) * Math.min(1, gaps.length / 6);
  return {
    medianMonths: median3 / 30.44,
    cv,
    n: gaps.length,
    regularity: cv <= 0.25 ? "REGULAR" : "IRREGULAR",
    confidence,
    nextExpected: dayNumberToIso(days[days.length - 1] + Math.round(median3)),
    medianGapDays: median3
  };
}

// lib/cotuc/timing-v3/decision/build-decision.ts
var DECISION_VERSION = "v3-p4";
var LIQUIDITY_MIN_VALUE_VND = 5e9;
function addTradingDays(iso, n, cal) {
  let d = toDayNumber(iso);
  if (d === null) throw new Error(`addTradingDays: ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 ${iso}`);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  let guard = 0;
  while (left > 0) {
    d += step;
    if (cal.isTradingDay(d)) left--;
    if (++guard > 5e3) throw new Error("addTradingDays: v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n l\u1EB7p");
  }
  return dayNumberToIso(d);
}
function resolveUpcomingExDate(today, announcedCashExDates, pastExDates, asOf, cal, postExWindow) {
  if (postExWindow && cal) {
    const lastPast = [...announcedCashExDates, ...pastExDates].filter((d) => d < today).sort().at(-1);
    const k = lastPast ? tradingDaysBetween(lastPast, today, cal) : null;
    if (lastPast && k !== null && k <= postExWindow.exitOffset) {
      return { value: lastPast, status: "CONFIRMED", source: "DERIVED", asOf, label: "VNDirect (\u0111\u1EE3t GDKHQ v\u1EEBa qua \u2014 c\u1EEDa s\u1ED5 sau GDKHQ)" };
    }
  }
  const upcoming = announcedCashExDates.filter((d) => d >= today).sort()[0];
  if (upcoming) return { value: upcoming, status: "CONFIRMED", source: "DERIVED", asOf, label: "VNDirect (th\xF4ng b\xE1o GDKHQ)" };
  const past = [...new Set([...pastExDates, ...announcedCashExDates].filter((d) => d < today))].sort();
  const freq = estimateDividendFrequency(past);
  if (!freq || !freq.nextExpected || !(freq.medianGapDays >= 60)) return null;
  let next = toDayNumber(freq.nextExpected);
  const todayN = toDayNumber(today);
  while (next < todayN) next += Math.round(freq.medianGapDays);
  if (cal) while (!cal.isTradingDay(next)) next++;
  return {
    value: dayNumberToIso(next),
    status: "ESTIMATED",
    source: "DERIVED",
    asOf,
    label: `\u01AF\u1EDBc t\xEDnh theo chu k\u1EF3 chi (trung v\u1ECB ${freq.medianMonths.toFixed(1)} th\xE1ng, ${freq.n + 1} \u0111\u1EE3t)`
  };
}
function averageTradedValue(bars, n = 20) {
  const rows = bars.filter((b) => b.close > 0 && typeof b.volume === "number" && b.volume >= 0).slice(-n);
  if (rows.length < Math.min(n, 10)) return null;
  return rows.reduce((a, b) => a + b.close * b.volume, 0) / rows.length;
}
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function curvePointAt(offsets, eventPaths, offset) {
  const idx = offsets.indexOf(offset);
  if (idx < 0) return void 0;
  const vals = eventPaths.map((p) => p.car[idx]).filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (vals.length < 5) return void 0;
  return { offset, n: vals.length, p5: quantile(vals, 0.05), p25: quantile(vals, 0.25), p75: quantile(vals, 0.75), p95: quantile(vals, 0.95) };
}
function priceOnOrBefore(series, date) {
  let lo = 0, hi = series.length - 1, ans = null;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (series[mid].date <= date) {
      ans = series[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
function lastCommonDate(stock, bench, today) {
  const b = new Set(bench.filter((p) => p.date <= today).map((p) => p.date));
  for (let i = stock.length - 1; i >= 0; i--) if (stock[i].date <= today && b.has(stock[i].date)) return stock[i].date;
  return null;
}
function carBetween(stock, bench, from, to) {
  const s0 = priceOnOrBefore(stock, from), s1 = priceOnOrBefore(stock, to);
  const b0 = priceOnOrBefore(bench, from), b1 = priceOnOrBefore(bench, to);
  if (!s0 || !s1 || !b0 || !b1 || s0.date !== b0.date || s1.date !== b1.date) return null;
  if (s0.adjClose <= 0 || s1.adjClose <= 0 || b0.adjClose <= 0 || b1.adjClose <= 0) return null;
  return Math.log(s1.adjClose / s0.adjClose) - Math.log(b1.adjClose / b0.adjClose);
}
var NO_ENTRY_PLAN = {
  tranches: [],
  runTooFar: { percentile: null, hasRunTooFar: false },
  invalidationLevel: null,
  invalidated: false,
  timeStopped: false,
  pauseFurtherEntries: false
};
function pct2(v) {
  return `${Math.round(v * 100)}%`;
}
function buildDecisionSnapshot(input) {
  const { ticker, today, cal, stats, offsets, eventPaths, stockPrices, benchmarkPrices, exDate, earnings, earningsStats } = input;
  const regime = input.regime ?? classifyMarketRegime({ closes: benchmarkPrices.filter((p) => p.date <= today).map((p) => p.adjClose) });
  const mult = REGIME_WEIGHT_MULTIPLIER[regime.regime];
  const rec = optimizeDividendTiming({ exDate, cycle: stats, earnings }, { today, cal });
  const win = selectedWindow(stats);
  const k = rec.tdToEx === null ? null : -rec.tdToEx;
  const priceDate = lastCommonDate(stockPrices, benchmarkPrices, today);
  const signals = [];
  const weighted = [];
  if (win && rec.window) {
    const wins = Math.round(win.winRate * win.nEvents);
    const prior = input.dividendPriors?.[win.id] ?? { alpha0: 1, beta0: 1 };
    const post = betaBinomialPosterior(wins, win.nEvents - wins, prior.alpha0, prior.beta0);
    const weight = win.nEvents * mult;
    weighted.push({ name: "C\u1ED5 t\u1EE9c", probability: post.mean, weight });
    signals.push({
      name: "C\u1ED5 t\u1EE9c",
      used: true,
      probability: post.mean,
      weight,
      detail: `${win.label}: th\u1EAFng ${wins}/${win.nEvents} \u0111\u1EE3t \u2192 h\u1EADu nghi\u1EC7m Beta ${pct2(post.mean)} (CI90 ${pct2(post.ci[0])}\u2013${pct2(post.ci[1])})`
    });
  } else {
    signals.push({ name: "C\u1ED5 t\u1EE9c", used: false, probability: null, weight: 0, detail: "Kh\xF4ng c\xF3 c\u1EEDa s\u1ED5 c\u1ED5 t\u1EE9c qua c\u1ED5ng th\u1ED1ng k\xEA" });
  }
  let earningsInfo = null;
  if (earnings) {
    const tdToEarn = tradingDaysBetween(today, earnings.expectedAnnounce.date, cal);
    earningsInfo = { quarterLabel: earnings.quarterLabel, expectedAnnounce: earnings.expectedAnnounce.date, tdToEarnings: tdToEarn };
    const ew = earningsStats ? selectedWindow(earningsStats) : null;
    const rp = earningsStats?.reactionProbability ?? null;
    const inHold = rec.window && rec.tdToEx !== null && tdToEarn !== null && tdToEarn >= 0 && tdToEarn - rec.tdToEx <= rec.window.exitOffset;
    if (inHold && ew && rp) {
      const weight = ew.nEvents * mult;
      weighted.push({ name: "M\xF9a v\u1EE5 KQKD", probability: rp.mean, weight });
      signals.push({ name: "M\xF9a v\u1EE5 KQKD", used: true, probability: rp.mean, weight, detail: `${earnings.quarterLabel} \xB7 ${ew.label}: P(ph\u1EA3n \u1EE9ng d\u01B0\u01A1ng) ${pct2(rp.mean)}` });
    } else {
      signals.push({
        name: "M\xF9a v\u1EE5 KQKD",
        used: false,
        probability: rp?.mean ?? null,
        weight: 0,
        detail: !inHold ? `KQKD ${earnings.quarterLabel} (d\u1EF1 ki\u1EBFn ${earnings.expectedAnnounce.date}) kh\xF4ng r\u01A1i v\xE0o th\u1EDDi gian n\u1EAFm gi\u1EEF` : `${earnings.quarterLabel}: ch\u01B0a c\xF3 c\u1EEDa s\u1ED5 m\xF9a v\u1EE5 \u0111\u1EA1t ki\u1EC3m \u0111\u1ECBnh (c\u1EA7n \u2265 8 k\u1EF3)`
      });
    }
  } else {
    signals.push({ name: "M\xF9a v\u1EE5 KQKD", used: false, probability: null, weight: 0, detail: "Ch\u01B0a c\xF3 t\xEDn hi\u1EC7u KQKD" });
  }
  const combined = combineLogOdds(weighted);
  let currentCar = null;
  let entryPlan = NO_ENTRY_PLAN;
  if (rec.window && exDate && k !== null) {
    let curvePoint;
    if (priceDate && k >= offsets[0]) {
      const baseDate = addTradingDays(exDate.value, offsets[0], cal);
      if (baseDate <= priceDate) currentCar = carBetween(stockPrices, benchmarkPrices, baseDate, priceDate);
      const nearest = offsets.reduce((best, o) => Math.abs(o - k) < Math.abs(best - k) ? o : best, offsets[0]);
      curvePoint = curvePointAt(offsets, eventPaths, nearest);
    }
    entryPlan = buildEntryPlanSummary({
      entryFrom: rec.window.entryFrom,
      entryTo: rec.window.entryTo,
      exitOffset: rec.window.exitOffset,
      currentOffset: k,
      ...currentCar !== null ? { currentCarValue: currentCar, curvePointAtCurrentOffset: curvePoint } : {}
    });
  }
  const liquidityOk = input.avgValue20 === null ? null : input.avgValue20 >= LIQUIDITY_MIN_VALUE_VND;
  const decision = computeDecisionState({
    action: rec.action,
    combined,
    entryPlan,
    marketRegime: regime.regime,
    dateStatus: rec.dateStatus,
    earningsConflict: rec.earningsImpact.conflict,
    liquidityOk
  });
  const liq = decision.checks.find((c) => c.key === "liquidity");
  if (liq && input.avgValue20 !== null) liq.detail = `${liquidityOk ? "\u0110\u1EE7" : "Th\u1EA5p"} \u2014 GTGD b\xECnh qu\xE2n 20 phi\xEAn ${(input.avgValue20 / 1e9).toFixed(1)} t\u1EF7 (ng\u01B0\u1EE1ng 5 t\u1EF7)`;
  const reg = decision.checks.find((c) => c.key === "marketRegime");
  if (reg && regime.reasons.length) reg.detail = `${reg.detail} \u2014 ${regime.reasons.join("; ")}`;
  const dt = decision.checks.find((c) => c.key === "dateConfirmed");
  if (dt && exDate) dt.detail = `${dt.detail}: ${exDate.value.slice(8, 10)}/${exDate.value.slice(5, 7)}/${exDate.value.slice(0, 4)} \xB7 ${exDate.label}`;
  return {
    version: DECISION_VERSION,
    ticker,
    asOf: today,
    priceDate,
    exDate,
    recommendation: rec,
    decision,
    combined,
    signals,
    regime: { regime: regime.regime, belowMa: regime.belowMa, currentVolatility: regime.currentVolatility, volatilityPercentile: regime.volatilityPercentile, reasons: regime.reasons },
    entryPlan,
    currentCar,
    liquidity: { avgValue20: input.avgValue20, threshold: LIQUIDITY_MIN_VALUE_VND, ok: liquidityOk },
    earnings: earningsInfo,
    disclaimer: "NOT_INVESTMENT_ADVICE"
  };
}

// lib/cotuc/price-adjustment.ts
var CASH_DIVIDEND_TAX_RATE = 0.05;

// lib/cotuc/timing-v3/total-return.ts
function buildTotalReturnSeries(nominal, cash, shares = [], taxRate = CASH_DIVIDEND_TAX_RATE) {
  const bars = [...nominal].filter((p) => p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const applied = [];
  const skipped = [];
  if (!bars.length) return { bars: [], applied, skipped };
  const first = bars[0].date, last = bars[bars.length - 1].date;
  const prevClose = (exDate) => {
    let p = null;
    for (const b of bars) {
      if (b.date < exDate) p = b.close;
      else break;
    }
    return p;
  };
  const factorAt = /* @__PURE__ */ new Map();
  const push = (exDate, f) => factorAt.set(exDate, (factorAt.get(exDate) ?? 1) * f);
  for (const c of cash) {
    if (!(c.valuePerShare > 0)) continue;
    if (c.exDate <= first || c.exDate > last) {
      skipped.push({ exDate: c.exDate, reason: "ngo\xE0i ph\u1EA1m vi gi\xE1" });
      continue;
    }
    const p = prevClose(c.exDate);
    if (!p) {
      skipped.push({ exDate: c.exDate, reason: "kh\xF4ng c\xF3 gi\xE1 phi\xEAn tr\u01B0\u1EDBc GDKHQ" });
      continue;
    }
    const y = c.valuePerShare * (1 - taxRate) / p;
    if (!(y > 0) || y >= 0.5) {
      skipped.push({ exDate: c.exDate, reason: `t\u1EF7 su\u1EA5t b\u1EA5t th\u01B0\u1EDDng ${(y * 100).toFixed(1)}%` });
      continue;
    }
    push(c.exDate, 1 - y);
    applied.push({ exDate: c.exDate, kind: "CASH", factor: 1 - y, detail: `${c.valuePerShare}\u0111/CP, sau thu\u1EBF ${(y * 100).toFixed(2)}% gi\xE1` });
  }
  for (const s of shares) {
    if (!(s.ratio > 0) || s.ratio >= 10) {
      skipped.push({ exDate: s.exDate, reason: `t\u1EF7 l\u1EC7 kh\xF4ng h\u1EE3p l\u1EC7 ${s.ratio}` });
      continue;
    }
    if (s.exDate <= first || s.exDate > last) {
      skipped.push({ exDate: s.exDate, reason: "ngo\xE0i ph\u1EA1m vi gi\xE1" });
      continue;
    }
    push(s.exDate, 1 / (1 + s.ratio));
    applied.push({ exDate: s.exDate, kind: "SHARES", factor: 1 / (1 + s.ratio), detail: `t\u1EF7 l\u1EC7 ${(s.ratio * 100).toFixed(1)}%` });
  }
  const out = new Array(bars.length);
  let k = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    out[i] = { date: bars[i].date, adjClose: bars[i].close * k };
    k *= factorAt.get(bars[i].date) ?? 1;
  }
  return { bars: out, applied: applied.sort((a, b) => a.exDate.localeCompare(b.exDate)), skipped };
}
function crossCheckWithReference(applied, refAdjustments, taxRate = CASH_DIVIDEND_TAX_RATE, until = "2024-12-31") {
  const refBy = new Map(refAdjustments.map((r) => [r.date, r.factor]));
  let matched = 0;
  const mismatched = [];
  const byDate = /* @__PURE__ */ new Map();
  for (const a of applied) {
    if (a.exDate > until) continue;
    const pre = a.kind === "CASH" ? 1 - (1 - a.factor) / (1 - taxRate) : a.factor;
    byDate.set(a.exDate, (byDate.get(a.exDate) ?? 1) * pre);
  }
  for (const [exDate, vci] of byDate) {
    const ref = refBy.get(exDate) ?? null;
    if (ref !== null && Math.abs(ref - vci) <= 4e-3) matched++;
    else mismatched.push({ exDate, vci: Math.round(vci * 1e4) / 1e4, ref });
  }
  return { matched, mismatched };
}

// lib/cotuc/timing-v3/price-source.ts
async function loadCorporateActions(ticker) {
  const vnd = await fetchVndCorporateActions(ticker);
  if (vnd.ok && (vnd.cash.length || vnd.shares.length)) {
    return { ok: true, source: "VNDIRECT", cash: vnd.cash.map(({ exDate, valuePerShare }) => ({ exDate, valuePerShare })), shares: vnd.shares.map(({ exDate, ratio }) => ({ exDate, ratio })) };
  }
  const ev = await fetchDividendEvents(ticker, 66, 0);
  if (!ev.available) return { ok: false, cash: [], shares: [], error: `VNDirect: ${vnd.error ?? "kh\xF4ng c\xF3 s\u1EF1 ki\u1EC7n"}; VCI: ${ev.error ?? "kh\xF4ng tr\u1EA3 s\u1EF1 ki\u1EC7n"}` };
  const life = buildLifecycleEvents(ticker, ev.rawEvents ?? []);
  const day = (s) => s ? s.slice(0, 10) : null;
  const cash = life.filter((e) => e.eventType === "CASH" && e.valuePerShare && day(e.exrightDate)).map((e) => ({ exDate: day(e.exrightDate), valuePerShare: e.valuePerShare }));
  const shares = life.filter((e) => (e.eventType === "STOCK_DIVIDEND" || e.eventType === "BONUS_ISSUE") && e.exerciseRatio && day(e.exrightDate)).map((e) => ({ exDate: day(e.exrightDate), ratio: e.exerciseRatio }));
  return { ok: true, source: "VCI", cash, shares };
}
async function loadStockPrices(ticker, years = 5) {
  const notes = [];
  const [ssi, ca] = await Promise.all([fetchSsiNominalHistory(ticker, years), loadCorporateActions(ticker)]);
  if (ssi.success && ssi.data && ssi.data.length >= 60 && ca.ok) {
    const tr = buildTotalReturnSeries(ssi.data, ca.cash, ca.shares);
    const cc = crossCheckWithReference(tr.applied, ssi.referenceAdjustments);
    notes.push(`Gi\xE1 SSI + ${tr.applied.length} s\u1EF1 ki\u1EC7n quy\u1EC1n ${ca.source} (c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t sau thu\u1EBF 5%)${tr.skipped.length ? `, b\u1ECF qua ${tr.skipped.length} \u0111\u1EE3t ngo\xE0i ph\u1EA1m vi/b\u1EA5t th\u01B0\u1EDDng` : ""}.`);
    if (cc.matched + cc.mismatched.length) {
      notes.push(`\u0110\u1ED1i chi\u1EBFu gi\xE1 tham chi\u1EBFu c\u1EE7a S\u1EDF (t\u1EDBi 2024): kh\u1EDBp ${cc.matched}${cc.mismatched.length ? `, l\u1EC7ch ${cc.mismatched.map((m) => `${m.exDate} (VCI ${m.vci} / S\u1EDF ${m.ref ?? "kh\xF4ng th\u1EA5y"})`).join("; ")}` : ""}.`);
    }
    return { ok: true, prices: tr.bars, source: "SSI_TOTAL_RETURN", notes, avgValue20: averageTradedValue(ssi.data), cashExDates: ca.cash.map((c) => c.exDate) };
  }
  notes.push(!ssi.success ? `SSI l\u1ED7i (${ssi.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}) \u2014 d\xF9ng d\u1EF1 ph\xF2ng Yahoo (c\u1ED5 t\u1EE9c tr\u1EEB TR\u01AF\u1EDAC thu\u1EBF).` : `Thi\u1EBFu s\u1EF1 ki\u1EC7n quy\u1EC1n (${ca.error}) \u2014 kh\xF4ng d\xF9ng gi\xE1 SSI ch\u01B0a \u0111i\u1EC1u ch\u1EC9nh; d\xF9ng d\u1EF1 ph\xF2ng Yahoo (c\u1ED5 t\u1EE9c tr\u1EEB TR\u01AF\u1EDAC thu\u1EBF).`);
  const y = await fetchOhlcvHistory(ticker, `${years}y`);
  if (y.success && y.data && y.data.length >= 60) {
    const avgValue20 = ssi.success && ssi.data ? averageTradedValue(ssi.data) : null;
    return { ok: true, prices: y.data.map((b) => ({ date: b.date, adjClose: b.adjClose })), source: "YAHOO_FALLBACK", notes, avgValue20, cashExDates: ca.ok ? ca.cash.map((c) => c.exDate) : [] };
  }
  return { ok: false, prices: [], source: null, notes, error: `SSI: ${ssi.error ?? "-"}; VCI: ${ca.error ?? "-"}; Yahoo: ${y.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}` };
}
async function loadBenchmarkPrices(years = 5) {
  const notes = [];
  const ssi = await fetchSsiNominalHistory("VNINDEX", years, { timeoutMs: 6e4 });
  if (ssi.success && ssi.data && ssi.data.length >= 60) {
    return { ok: true, prices: ssi.data.map((b) => ({ date: b.date, adjClose: b.close })), source: "SSI", notes };
  }
  notes.push(`SSI VN-Index l\u1ED7i (${ssi.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}) \u2014 d\xF9ng d\u1EF1 ph\xF2ng VNDirect.`);
  const v = await fetchIndexOhlcvHistory("VNINDEX", Math.round(years * 365));
  if (v.success && v.data && v.data.length >= 60) {
    return { ok: true, prices: v.data.map((b) => ({ date: b.date, adjClose: b.close })), source: "VNDIRECT_FALLBACK", notes };
  }
  return { ok: false, prices: [], source: null, notes, error: `SSI: ${ssi.error ?? "-"}; VNDirect: ${v.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}` };
}

// lib/cotuc/timing-v3/compute-cycle-paths.ts
function indexByDate(prices) {
  const m = /* @__PURE__ */ new Map();
  for (const p of prices) m.set(p.date, p.adjClose);
  return m;
}
function addTradingDays2(dateIso, n, cal) {
  const start = toDayNumber(dateIso);
  if (start === null) throw new Error(`ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7: ${dateIso}`);
  if (n === 0) return dateIso;
  const step = n > 0 ? 1 : -1;
  let d = start;
  let count = 0;
  const maxIterations = Math.abs(n) * 3 + 30;
  let safetyCounter = 0;
  while (count !== Math.abs(n)) {
    d += step;
    if (cal.isTradingDay(d)) count++;
    safetyCounter++;
    if (safetyCounter > maxIterations) {
      throw new Error(
        `addTradingDays: vuot qua ${maxIterations} lan lap khi dich ${n} ngay GD tu ${dateIso} - ngay dich co the nam ngoai pham vi du lieu gia da tai (qua gan bien du lieu lich su/tuong lai).`
      );
    }
  }
  return dayNumberToIso(d);
}
function marketAdjustedLogReturn(pCur, pPrev, bCur, bPrev) {
  if (pCur <= 0 || pPrev <= 0 || bCur <= 0 || bPrev <= 0) return null;
  return Math.log(pCur / pPrev) - Math.log(bCur / bPrev);
}
function buildOneCarPath(exDate, offsets, stockByDate, benchByDate, cal) {
  const priceAt = (date) => {
    const s = stockByDate.get(date);
    const b = benchByDate.get(date);
    if (s === void 0 || b === void 0) return null;
    return { s, b };
  };
  const baseDate = addTradingDays2(exDate, offsets[0], cal);
  const base = priceAt(baseDate);
  const out = new Array(offsets.length).fill(null);
  if (!base) return out;
  out[0] = 0;
  let cum = 0;
  let prev = base;
  for (let i = 1; i < offsets.length; i++) {
    const date = addTradingDays2(exDate, offsets[i], cal);
    const cur = priceAt(date);
    if (!cur) {
      out[i] = null;
      continue;
    }
    const r = marketAdjustedLogReturn(cur.s, prev.s, cur.b, prev.b);
    if (r === null) {
      out[i] = null;
      continue;
    }
    cum += r;
    out[i] = cum;
    prev = cur;
  }
  return out;
}
function computeCyclePaths(input) {
  const { ticker, stockPrices, benchmarkPrices, events, offsets, cal, currentExDate, version, asOf } = input;
  if (offsets.length < 2) throw new Error("offsets c\u1EA7n \xEDt nh\u1EA5t 2 ph\u1EA7n t\u1EED");
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] <= offsets[i - 1]) throw new Error("offsets ph\u1EA3i t\u0103ng ng\u1EB7t");
  }
  const stockByDate = indexByDate(stockPrices);
  const benchByDate = indexByDate(benchmarkPrices);
  const eventPaths = [];
  const skippedEvents = [];
  const seen = /* @__PURE__ */ new Set();
  for (const ev of events) {
    if (toDayNumber(ev.exDate) === null) {
      skippedEvents.push({ exDate: ev.exDate, reason: "exDate kh\xF4ng h\u1EE3p l\u1EC7" });
      continue;
    }
    if (seen.has(ev.exDate)) {
      skippedEvents.push({ exDate: ev.exDate, reason: "exDate tr\xF9ng v\u1EDBi m\u1ED9t \u0111\u1EE3t \u0111\xE3 c\xF3" });
      continue;
    }
    seen.add(ev.exDate);
    let car;
    try {
      car = buildOneCarPath(ev.exDate, offsets, stockByDate, benchByDate, cal);
    } catch (err) {
      skippedEvents.push({ exDate: ev.exDate, reason: `loi khi tinh CAR path: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    if (car[0] !== 0) {
      skippedEvents.push({ exDate: ev.exDate, reason: `thi\u1EBFu gi\xE1 t\u1EA1i offset ${offsets[0]} (\u0111i\u1EC3m rebase)` });
      continue;
    }
    eventPaths.push({ exDate: ev.exDate, car });
  }
  eventPaths.sort((a, b) => a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0);
  let currentPath = null;
  if (currentExDate && toDayNumber(currentExDate) !== null) {
    const path = buildOneCarPath(currentExDate, offsets, stockByDate, benchByDate, cal);
    currentPath = path[0] === 0 ? path : null;
  }
  return { ticker, version, asOf, offsets, eventPaths, currentPath, skippedEvents };
}
function toCyclePathsV3(out) {
  const { skippedEvents: _skipped, ...rest } = out;
  void _skipped;
  return rest;
}

// lib/cotuc/timing-v3/compute-cycle-stats.ts
var DEFAULT_COSTS = {
  buyCostPct: 2e-3,
  sellCostPct: 15e-4,
  sellTaxPct: 1e-3,
  dividendTaxPct: 0.05
};
var DEFAULT_GATING = {
  minEvents: 8,
  maxFdrQValue: 0.1,
  minOosMeanNetIfAvailable: 0,
  minYearsForOos: 3,
  confidenceLevel: 0.9
};
var DEFAULT_BOOTSTRAP = { iterations: 2e3, seed: 20260924 };
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function netReturnOfEvent(s, costs) {
  const gross = Math.exp(s.carAtExit - s.carAtEntry) - 1;
  const divNet = s.netDividendYield * (1 - costs.dividendTaxPct);
  const cost = costs.buyCostPct + costs.sellCostPct + costs.sellTaxPct;
  return gross + divNet - cost;
}
function shrinkMean(sampleMean, n, priorMean, withinVar, betweenVar) {
  if (n <= 0) return { shrunkMean: priorMean, weight: 0 };
  if (betweenVar <= 0) return { shrunkMean: priorMean, weight: 0 };
  const kappa = withinVar / betweenVar;
  const weight = n / (n + kappa);
  return { shrunkMean: weight * sampleMean + (1 - weight) * priorMean, weight };
}
function sampleVariance(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}
function bootstrapLowerBoundOf(values, estimator, confidenceLevel, cfg) {
  if (values.length === 0) return Number.NaN;
  if (values.length === 1) return estimator(values);
  const rand = mulberry32(cfg.seed);
  const n = values.length;
  const stats = new Array(cfg.iterations);
  const sample = new Array(n);
  for (let b = 0; b < cfg.iterations; b++) {
    for (let i = 0; i < n; i++) sample[i] = values[Math.floor(rand() * n)];
    stats[b] = estimator(sample);
  }
  stats.sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;
  return stats[Math.max(0, Math.min(stats.length - 1, Math.floor(alpha * stats.length)))];
}
function walkForward(samples, costs, minYears) {
  const years = Array.from(new Set(samples.map((s) => s.year))).sort((a, b) => a - b);
  if (years.length < minYears) return { oosHitRate: null, oosMeanNet: null, yearsUsed: years.length };
  const oosNets = [];
  for (let i = 1; i < years.length; i++) {
    const y = years[i];
    const oosThisYear = samples.filter((s) => s.year === y);
    for (const s of oosThisYear) oosNets.push(netReturnOfEvent(s, costs));
  }
  if (oosNets.length === 0) return { oosHitRate: null, oosMeanNet: null, yearsUsed: years.length };
  const hit = oosNets.filter((n) => n > 0).length / oosNets.length;
  const mean = oosNets.reduce((a, b) => a + b, 0) / oosNets.length;
  return { oosHitRate: hit, oosMeanNet: mean, yearsUsed: years.length };
}
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
function oneSidedPValue(mean, sd, n) {
  if (n === 0 || sd === 0) return mean > 0 ? 0 : 1;
  const z = mean / (sd / Math.sqrt(n));
  return 1 - normalCdf(z);
}
function benjaminiHochberg(pValues) {
  const m = pValues.length;
  if (m === 0) return [];
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  const q = new Array(m);
  let prevQ = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = indexed[rank - 1];
    const raw = p * m / rank;
    prevQ = Math.min(prevQ, Math.max(raw, 0));
    q[i] = prevQ;
  }
  return q;
}
function computeWindowStat(candidate, opts = {}) {
  const costs = opts.costs ?? DEFAULT_COSTS;
  const gating = opts.gating ?? DEFAULT_GATING;
  const bootstrap = opts.bootstrap ?? DEFAULT_BOOTSTRAP;
  const priorMean = opts.priorMean ?? 0;
  const liquidityOk = opts.liquidityOk ?? true;
  const nets = candidate.samples.map((s) => netReturnOfEvent(s, costs));
  const n = nets.length;
  const meanCarRaw = candidate.samples.length ? candidate.samples.reduce((a, s) => a + (s.carAtExit - s.carAtEntry), 0) / candidate.samples.length : 0;
  const withinVar = sampleVariance(nets);
  const betweenVar = opts.betweenVar ?? Math.max(withinVar / 8, 1e-6);
  const { shrunkMean: netExpectancy } = shrinkMean(
    n ? nets.reduce((a, b) => a + b, 0) / n : 0,
    n,
    priorMean,
    withinVar,
    betweenVar
  );
  const { shrunkMean: meanCarShrunk } = shrinkMean(
    meanCarRaw,
    n,
    priorMean,
    sampleVariance(candidate.samples.map((s) => s.carAtExit - s.carAtEntry)),
    betweenVar
  );
  const shrunkOf = (xs) => shrinkMean(xs.reduce((a, b) => a + b, 0) / xs.length, xs.length, priorMean, sampleVariance(xs), betweenVar).shrunkMean;
  const netExpectancyLcb = n > 0 ? bootstrapLowerBoundOf(nets, shrunkOf, gating.confidenceLevel, bootstrap) : Number.NaN;
  const wins = nets.filter((x) => x > 0).length;
  const winRate = n > 0 ? wins / n : 0;
  const sd = Math.sqrt(withinVar);
  const pValue = oneSidedPValue(n ? nets.reduce((a, b) => a + b, 0) / n : 0, sd, n);
  const wf = walkForward(candidate.samples, costs, gating.minYearsForOos);
  const nEff = n > 0 ? n * (withinVar > 0 ? Math.min(1, betweenVar / (betweenVar + withinVar / n)) : 1) : 0;
  const passesGates = n >= gating.minEvents && Number.isFinite(netExpectancyLcb) && netExpectancyLcb > 0 && liquidityOk && (wf.oosMeanNet === null || wf.oosMeanNet > gating.minOosMeanNetIfAvailable);
  const window = {
    id: candidate.id,
    label: candidate.label,
    entryFrom: candidate.entryFrom,
    entryTo: candidate.entryTo,
    exitOffset: candidate.exitOffset,
    holdsThroughEx: candidate.holdsThroughEx,
    nEvents: n,
    nEff,
    meanCarRaw,
    meanCarShrunk,
    netExpectancy,
    netExpectancyLcb: Number.isFinite(netExpectancyLcb) ? netExpectancyLcb : 0,
    winRate,
    wins,
    losses: n - wins,
    oosHitRate: wf.oosHitRate,
    oosMeanNet: wf.oosMeanNet,
    fdrQValue: pValue,
    // tạm thời; computeFdrAcrossWindows sẽ ghi đè bằng q thật
    selected: passesGates
    // tạm thời; sẽ AND thêm điều kiện FDR
  };
  return { window, pValue };
}
function computeFdrAcrossWindows(stats, gating = DEFAULT_GATING) {
  const qValues = benjaminiHochberg(stats.map((s) => s.pValue));
  return stats.map((s, i) => ({
    ...s.window,
    fdrQValue: qValues[i],
    selected: s.window.selected && qValues[i] <= gating.maxFdrQValue
  }));
}
function computeCycleStats(ticker, candidates, opts) {
  const computed = candidates.map((c) => computeWindowStat(c, opts));
  const windows = computeFdrAcrossWindows(computed, opts.gating ?? DEFAULT_GATING);
  const eligible = windows.filter((w) => w.selected);
  const best = eligible.reduce(
    (acc, w) => acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc,
    null
  );
  return {
    ticker,
    version: opts.version,
    asOf: opts.asOf,
    eventType: "CASH",
    windows,
    selectedWindowId: best?.id ?? null,
    adjustedPriceBasis: "ADJ_CLOSE",
    benchmark: opts.benchmark ?? "VNINDEX"
  };
}

// lib/cotuc/timing-v3/candidate-windows.ts
var CANDIDATE_WINDOWS = [
  { id: "w1", label: "W1 \xB7 Gom s\u1EDBm tr\u01B0\u1EDBc M\u1ED1c 1", entryFrom: -75, entryTo: -60, exitOffset: -60 + 60, holdsThroughEx: true },
  { id: "w2", label: "W2 \xB7 Tr\u01B0\u1EDBc h\u1ECDp \u0110H\u0110C\u0110", entryFrom: -30, entryTo: -15, exitOffset: -15 + 20, holdsThroughEx: true },
  { id: "w3", label: "W3 \xB7 Tr\u01B0\u1EDBc GDKHQ (an to\xE0n)", entryFrom: -25, entryTo: -15, exitOffset: -15 + 18, holdsThroughEx: true },
  { id: "w4", label: "W4 \xB7 Ngay sau GDKHQ", entryFrom: 3, entryTo: 6, exitOffset: 6 + 4, holdsThroughEx: false },
  { id: "w5", label: "W5 \xB7 Sau khi CP/ti\u1EC1n v\u1EC1 TK", entryFrom: 20, entryTo: 35, exitOffset: 35 + 15, holdsThroughEx: false }
];
function buildRequiredOffsets() {
  const set = /* @__PURE__ */ new Set([0]);
  for (const w of CANDIDATE_WINDOWS) {
    set.add(w.entryFrom);
    set.add(w.entryTo);
    set.add(w.exitOffset);
  }
  return Array.from(set).sort((a, b) => a - b);
}

// lib/cotuc/timing-v3/compute-cycle-io.ts
var cycleMemo = null;
async function cycleHistory(ticker) {
  if (!cycleMemo || Date.now() - cycleMemo.at > 10 * 6e4) {
    const rows = await storeList("cycle", { fields: ["ticker", "exDate"] });
    const byTicker = /* @__PURE__ */ new Map();
    for (const r of rows) byTicker.set(r.ticker, [...byTicker.get(r.ticker) ?? [], { exDate: new Date(r.exDate) }]);
    for (const list of byTicker.values()) list.sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
    cycleMemo = { at: Date.now(), byTicker };
  }
  return cycleMemo.byTicker.get(ticker) ?? [];
}
var CYCLE_YEARS = 10;
async function fetchBenchmarkPricesOnce() {
  const bench = await loadBenchmarkPrices(CYCLE_YEARS);
  if (!bench.ok) return { reason: "BENCHMARK_PRICE_FETCH_FAILED", detail: bench.error ?? "khong ro" };
  return Object.assign(bench.prices, { source: bench.source });
}
async function buildCycleContext(ticker, preloadedBenchmark) {
  const historyRows = await cycleHistory(ticker);
  const stockRes = await loadStockPrices(ticker, CYCLE_YEARS);
  let benchmarkPrices;
  let benchmarkSource = null;
  if (preloadedBenchmark) {
    benchmarkPrices = preloadedBenchmark;
    benchmarkSource = preloadedBenchmark.source ?? null;
  } else {
    const bench = await loadBenchmarkPrices(CYCLE_YEARS);
    if (!bench.ok) return { reason: "BENCHMARK_PRICE_FETCH_FAILED", detail: bench.error ?? "khong ro" };
    benchmarkPrices = bench.prices;
    benchmarkSource = bench.source;
  }
  if (!stockRes.ok || stockRes.prices.length < 60) {
    return { reason: "STOCK_PRICE_FETCH_FAILED", detail: stockRes.error ?? `so_phien=${stockRes.prices.length} (can >=60)` };
  }
  const todayIso = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const vndPast = [...new Set((stockRes.cashExDates ?? []).filter((d) => d < todayIso))].sort().reverse();
  if (vndPast.length === 0 && historyRows.length === 0) {
    return { reason: "NO_DIVIDEND_HISTORY", detail: `Khong co dot co tuc tien mat nao (VNDirect + DividendCycleWindow) cho ticker="${ticker}"` };
  }
  const stockPrices = stockRes.prices;
  const stockDateSet = new Set(stockPrices.map((p) => p.date));
  const commonDates = benchmarkPrices.map((p) => p.date).filter((d) => stockDateSet.has(d));
  const cal = makeTradingCalendarFromPrices(commonDates);
  const eventExDates = vndPast.length > 0 ? vndPast : historyRows.map((r) => r.exDate.toISOString().slice(0, 10));
  const offsets = buildRequiredOffsets();
  const cyclePaths = computeCyclePaths({
    ticker,
    stockPrices,
    benchmarkPrices,
    events: eventExDates.map((exDate) => ({ exDate })),
    offsets,
    cal,
    currentExDate: null,
    // GD hien tai (chua xay ra) - chua ho tro trong Giai doan 2, se bo sung neu can
    version: "v3-p2",
    asOf: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  });
  return {
    ticker,
    cyclePaths,
    eventExDates,
    priceSource: { stock: stockRes.source, benchmark: benchmarkSource, notes: stockRes.notes },
    stockPrices,
    benchmarkPrices,
    avgValue20: stockRes.avgValue20 ?? null,
    cashExDates: stockRes.cashExDates ?? []
  };
}
function buildCycleStatsV3(ctx) {
  const offsets = buildRequiredOffsets();
  const offsetIndex = new Map(offsets.map((o, i) => [o, i]));
  const candidates = CANDIDATE_WINDOWS.map((w) => {
    const entryIdx = offsetIndex.get(w.entryTo);
    const exitIdx = offsetIndex.get(w.exitOffset);
    const samples = [];
    for (const ep of ctx.cyclePaths.eventPaths) {
      const carAtEntry = ep.car[entryIdx];
      const carAtExit = ep.car[exitIdx];
      if (carAtEntry === null || carAtExit === null) continue;
      samples.push({
        exDate: ep.exDate,
        carAtEntry,
        carAtExit,
        // DON GIAN HOA CO CHU DICH (Giai doan 2): chua co gia tri co
        // tuc chinh xac map theo tung dot rieng le trong pham vi nay -
        // dat 0 (KHONG bia so), se bo sung tu VCI events o giai doan sau
        // neu can chinh xac hon phan netExpectancy khi holdsThroughEx.
        netDividendYield: 0,
        year: Number(ep.exDate.slice(0, 4))
      });
    }
    return {
      id: w.id,
      label: w.label,
      entryFrom: w.entryFrom,
      entryTo: w.entryTo,
      exitOffset: w.exitOffset,
      holdsThroughEx: w.holdsThroughEx,
      samples
    };
  });
  return computeCycleStats(ctx.ticker, candidates, {
    version: "v3-p2",
    asOf: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    benchmark: "VNINDEX"
  });
}

// lib/cotuc/timing-v3/vn-trading-calendar.ts
var TZ = 7;
var INT = Math.floor;
function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}
function jdToDate(jd) {
  let b, c;
  if (jd > 2299160) {
    const a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT(b * 146097 / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT(1461 * d / 4);
  const m = INT((5 * e + 2) / 153);
  return [e - INT((153 * m + 2) / 5) + 1, m + 3 - 12 * INT(m / 10), b * 100 + d - 4800 + INT(m / 10)];
}
function newMoon(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;
  let Jd1 = 241502075933e-5 + 29.53058868 * k + 1178e-7 * T2 - 155e-9 * T3;
  Jd1 += 33e-5 * Math.sin((166.56 + 132.87 * T - 9173e-6 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 333e-7 * T2 - 347e-8 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 1236e-8 * T3;
  const F = 21.2964 + 390.67050646 * k - 16528e-7 * T2 - 239e-8 * T3;
  let C1 = (0.1734 - 393e-6 * T) * Math.sin(M * dr) + 21e-4 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 4e-4 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 51e-4 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 74e-4 * Math.sin(dr * (M - Mpr)) + 4e-4 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 4e-4 * Math.sin(dr * (2 * F - M)) - 6e-4 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 1e-3 * Math.sin(dr * (2 * F - Mpr)) + 5e-4 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11 ? 1e-3 + 839e-6 * T + 2261e-7 * T2 - 845e-8 * T3 - 81e-9 * T * T3 : -278e-6 + 265e-6 * T + 262e-6 * T2;
  return Jd1 + C1 - deltat;
}
function sunLongitude(jdn) {
  const T = (jdn - 2451545) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 1559e-7 * T2 - 48e-8 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 3032e-7 * T2;
  let DL = (1.9146 - 4817e-6 * T - 14e-6 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 101e-6 * T) * Math.sin(dr * 2 * M) + 29e-5 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - Math.PI * 2 * INT(L / (Math.PI * 2));
  return L;
}
var getNewMoonDay = (k) => INT(newMoon(k) + 0.5 + TZ / 24);
var getSunLongitudeSector = (dayNumber) => INT(sunLongitude(dayNumber - 0.5 - TZ / 24) / Math.PI * 6);
function getLunarMonth11(yy) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k);
  if (getSunLongitudeSector(nm) >= 9) nm = getNewMoonDay(k - 1);
  return nm;
}
function getLeapMonthOffset(a11) {
  const k = INT((a11 - 2415021076998695e-9) / 29.530588853 + 0.5);
  let last;
  let i = 1;
  let arc = getSunLongitudeSector(getNewMoonDay(k + i));
  do {
    last = arc;
    i++;
    arc = getSunLongitudeSector(getNewMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}
function lunarToSolar(lunarDay, lunarMonth, lunarYear, lunarLeap = false) {
  let a11, b11;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1);
    b11 = getLunarMonth11(lunarYear);
  } else {
    a11 = getLunarMonth11(lunarYear);
    b11 = getLunarMonth11(lunarYear + 1);
  }
  const k = INT(0.5 + (a11 - 2415021076998695e-9) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap && lunarMonth !== leapMonth) return null;
    if (lunarLeap || off >= leapOff) off += 1;
  }
  return jdToDate(getNewMoonDay(k + off) + lunarDay - 1);
}
var pad = (n) => String(n).padStart(2, "0");
var ymd = ([d, m, y]) => `${y}-${pad(m)}-${pad(d)}`;
var tetDate = (year) => ymd(lunarToSolar(1, 1, year));
var hungKingsDate = (year) => ymd(lunarToSolar(10, 3, year));
var toJd = (iso) => jdFromDate(Number(iso.slice(8, 10)), Number(iso.slice(5, 7)), Number(iso.slice(0, 4)));
var fromJd = (jd) => ymd(jdToDate(jd));
var weekdayJd = (jd) => (jd + 1) % 7;
var isWeekendJd = (jd) => weekdayJd(jd) === 0 || weekdayJd(jd) === 6;
function tetClosure(year) {
  const center = toJd(tetDate(year)) + 1;
  const days = [];
  for (let d = center - 8; d <= center + 8; d++) if (!isWeekendJd(d)) days.push(d);
  days.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  return days.slice(0, 5);
}
function sept2Adjacent(year) {
  const d2 = toJd(`${year}-09-02`);
  const wd = weekdayJd(d2);
  return wd === 1 || wd === 4 || wd === 0 ? d2 + 1 : d2 - 1;
}
function ruleHolidays(year) {
  const out = /* @__PURE__ */ new Map();
  const add = (jd, reason) => {
    if (!isWeekendJd(jd) && !out.has(jd)) out.set(jd, reason);
  };
  for (const d of tetClosure(year)) add(d, "T\u1EBFt Nguy\xEAn \u0111\xE1n");
  const singles = [
    [toJd(`${year}-01-01`), "T\u1EBFt D\u01B0\u01A1ng l\u1ECBch"],
    [toJd(hungKingsDate(year)), "Gi\u1ED7 T\u1ED5 H\xF9ng V\u01B0\u01A1ng"],
    [toJd(`${year}-04-30`), "Ng\xE0y Th\u1ED1ng nh\u1EA5t"],
    [toJd(`${year}-05-01`), "Qu\u1ED1c t\u1EBF Lao \u0111\u1ED9ng"],
    [toJd(`${year}-09-02`), "Qu\u1ED1c kh\xE1nh"]
  ];
  if (year >= 2021) singles.push([sept2Adjacent(year), "Qu\u1ED1c kh\xE1nh (ng\xE0y li\u1EC1n k\u1EC1)"]);
  singles.sort((a, b) => a[0] - b[0]);
  const taken = new Set(singles.map(([d]) => d));
  for (const [d, reason] of singles) {
    if (!isWeekendJd(d)) {
      add(d, reason);
      continue;
    }
    let c = d + 1;
    while (isWeekendJd(c) || out.has(c) || taken.has(c) && c !== d) c++;
    add(c, `${reason} (ngh\u1EC9 b\xF9)`);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([jd, reason]) => ({ date: fromJd(jd), reason }));
}
function ruleHolidaySet(fromYear, toYear) {
  const m = /* @__PURE__ */ new Map();
  for (let y = fromYear; y <= toYear; y++) for (const h of ruleHolidays(y)) m.set(h.date, h.reason);
  return m;
}
var dayNumberToIso2 = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
function makeVnTradingCalendar(gateway = null) {
  const cache3 = /* @__PURE__ */ new Map();
  const rulesOf = (year) => {
    let m = cache3.get(year);
    if (!m) {
      m = ruleHolidaySet(year, year);
      cache3.set(year, m);
    }
    return m;
  };
  const isHolidayIso = (iso) => {
    if (gateway && iso >= gateway.from && iso <= gateway.to) return gateway.holidays.has(iso);
    return rulesOf(Number(iso.slice(0, 4))).has(iso);
  };
  return {
    isHolidayIso,
    isTradingDay(dayNumber) {
      const w = new Date(dayNumber * 864e5).getUTCDay();
      if (w === 0 || w === 6) return false;
      return !isHolidayIso(dayNumberToIso2(dayNumber));
    }
  };
}
async function fetchGatewayHolidays(gatewayBase, from, to, { fetchImpl = fetch, timeoutMs = 1e4 } = {}) {
  try {
    const res = await fetchImpl(`${gatewayBase.replace(/\/+$/, "")}/api/market/trading-calendar?from=${from}&to=${to}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.from || !body.to || !Array.isArray(body.holidays)) return null;
    return { from: body.from, to: body.to, holidays: new Set(body.holidays.map((h) => h.date)) };
  } catch {
    return null;
  }
}

// lib/cotuc/timing-v3/vn-holidays.ts
var current = makeVnTradingCalendar(null);
var loadedAt = 0;
var TTL_MS2 = 6 * 36e5;
var vnHolidayCalendar = { isTradingDay: (dayNumber) => current.isTradingDay(dayNumber) };
function setGatewayHolidays(g) {
  current = makeVnTradingCalendar(g);
  loadedAt = g ? Date.now() : 0;
}
async function refreshVnHolidayCalendar({ fetchImpl = fetch, force = false } = {}) {
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS2) return true;
  const y = (/* @__PURE__ */ new Date()).getUTCFullYear();
  const g = await fetchGatewayHolidays(MARKET_GATEWAY_URL, `${y - 1}-01-01`, `${y + 2}-12-31`, { fetchImpl });
  if (g) setGatewayHolidays(g);
  return g !== null;
}

// lib/cotuc/timing-v3/decision/tracking.ts
var REISSUE_GAP_DAYS = 120;
function planIssue(snap, existing, cal, nowIso) {
  const rec = snap.recommendation;
  if (rec.action !== "IN_WINDOW" || !rec.window || !snap.exDate || !snap.priceDate) return null;
  if (snap.decision.level === "AVOID") return null;
  const win = rec.window;
  const cutoff = new Date(Date.parse(snap.asOf) - REISSUE_GAP_DAYS * 864e5).toISOString();
  const dup = existing.some((r) => r.ticker === snap.ticker && r.windowId === win.id && (r.outcome === null || r.issuedAt >= cutoff));
  if (dup) return null;
  return {
    id: `${snap.ticker}:${win.id}:${snap.priceDate}`,
    ticker: snap.ticker,
    windowId: win.id,
    level: snap.decision.level,
    predictedProbability: snap.decision.combinedProbability,
    components: snap.combined.contributions.map((c) => ({ name: c.name, logOdds: c.logOdds })),
    exDate: snap.exDate.value,
    exDateStatus: snap.exDate.status,
    entryDate: snap.priceDate,
    plannedExitDate: addTradingDays(snap.exDate.value, win.exitOffset, cal),
    issuedAt: nowIso,
    outcome: null,
    realizedCar: null,
    exitDate: null,
    outcomeRecordedAt: null
  };
}
function planResolutions(open, stock, bench) {
  const lastStock = stock[stock.length - 1]?.date;
  const lastBench = bench[bench.length - 1]?.date;
  if (!lastStock || !lastBench) return [];
  const out = [];
  for (const r of open) {
    if (r.outcome !== null) continue;
    if (lastStock < r.plannedExitDate || lastBench < r.plannedExitDate) continue;
    const exitDate = stock.find((p) => p.date >= r.plannedExitDate)?.date;
    if (!exitDate) continue;
    const car = carBetween(stock, bench, r.entryDate, exitDate);
    if (car === null) continue;
    out.push({ id: r.id, outcome: car > 0 ? 1 : 0, realizedCar: car, exitDate });
  }
  return out;
}

// lib/jobs/timing-signals-scan.ts
var BATCH_SIZE = 8;
function chunk(arr2, size) {
  const out = [];
  for (let i = 0; i < arr2.length; i += size) out.push(arr2.slice(i, i + size));
  return out;
}
function vnToday() {
  return new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
}
var toJson = (v) => JSON.parse(JSON.stringify(v));
function rowToTrack(r) {
  return {
    ...r,
    level: r.level,
    components: r.components ?? [],
    issuedAt: r.issuedAt.toISOString(),
    outcome: r.outcome === null ? null : r.outcome ? 1 : 0,
    outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null
  };
}
async function runTimingSignalsScan(params = {}) {
  let wrote = false;
  try {
    const offset = Number(params.offset ?? 0);
    const limit = Math.max(1, Math.min(60, Number(params.limit ?? 25)));
    await refreshVnHolidayCalendar();
    const benchmarkPrices = await fetchBenchmarkPricesOnce();
    if ("reason" in benchmarkPrices) {
      return jobFail({ error: "Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c gi\xE1 VN-Index.", detail: benchmarkPrices.detail });
    }
    const universe = await getCotucUniverse();
    const allTickers = universe.tickers.map((t) => t.ticker);
    const tickers = allTickers.slice(offset, offset + limit);
    const today = vnToday();
    const now = /* @__PURE__ */ new Date();
    const [liveQuotes, liveIndex] = await Promise.all([fetchLiveQuotes(tickers), fetchLiveIndex("VNINDEX")]);
    const benchLive = appendIntradayBar(benchmarkPrices, liveIndex);
    const regime = classifyMarketRegime({ closes: benchLive.filter((p) => p.date <= today).map((p) => p.adjClose) });
    const ctxs = [];
    const noHistory = [];
    let skippedCount = 0;
    for (const batch of chunk(tickers, BATCH_SIZE)) {
      const results = await Promise.all(batch.map(async (ticker) => {
        try {
          const ctx = await buildCycleContext(ticker, benchmarkPrices);
          if ("reason" in ctx) {
            if (ctx.reason === "NO_DIVIDEND_HISTORY") noHistory.push(ticker);
            return null;
          }
          return { ctx, stats: buildCycleStatsV3(ctx) };
        } catch (e) {
          console.error(`[timing-signals-scan] ${ticker}:`, e);
          return null;
        }
      }));
      for (const r of results) {
        if (r) ctxs.push(r);
        else skippedCount++;
      }
    }
    const batchRates = ctxs.flatMap((c) => c.stats.windows.map((w) => ({ ticker: c.ctx.ticker, id: w.id, nEvents: w.nEvents, winRate: w.winRate })));
    const inBatch = new Set(ctxs.map((c) => c.ctx.ticker));
    const storedRates = (await loadBacktestRates()).filter((r) => !inBatch.has(r.ticker)).flatMap((r) => r.bt.map((w) => ({ ticker: r.ticker, ...w })));
    const allRates = [...batchRates, ...storedRates];
    const windowIds = new Set(allRates.map((r) => r.id));
    const priorFor = (ticker) => {
      const out = {};
      for (const id of windowIds) {
        const rates = allRates.filter((r) => r.ticker !== ticker && r.id === id && r.nEvents >= 3).map((r) => r.winRate);
        if (rates.length >= 5) out[id] = estimatePriorFromRates(rates, 10);
      }
      return out;
    };
    const seasonRows = await storeList("season", {
      tickers: ctxs.map((c) => c.ctx.ticker),
      fields: ["ticker", "earningsSignal", "stats"]
    });
    const seasonBy = new Map(seasonRows.map((r) => [r.ticker, r]));
    const trackRows = await storeList("track", { tickers: ctxs.map((c) => c.ctx.ticker) });
    const tracksBy = /* @__PURE__ */ new Map();
    for (const r of trackRows) {
      const t = rowToTrack(withDates(r, ["issuedAt", "outcomeRecordedAt"]));
      tracksBy.set(t.ticker, [...tracksBy.get(t.ticker) ?? [], t]);
    }
    const timingOut = [];
    const decisionOut = [];
    const trackOut = [];
    const offsets = buildRequiredOffsets();
    let savedCount = 0, decisionCount = 0, issuedCount = 0, resolvedCount = 0;
    const levels = {};
    const errors = [];
    for (const { ctx, stats } of ctxs) {
      const ticker = ctx.ticker;
      try {
        const season = seasonBy.get(ticker);
        const earnings = season?.earningsSignal ?? null;
        const q = earnings ? Number(earnings.quarterLabel.match(/^Q([1-4])/)?.[1] ?? 0) : 0;
        const earningsStats = q ? (season?.stats ?? {})[String(q)] ?? null : null;
        const selWin = selectedWindow(stats);
        const exDate = resolveUpcomingExDate(
          today,
          ctx.cashExDates ?? [],
          ctx.eventExDates,
          now.toISOString(),
          vnHolidayCalendar,
          selWin && selWin.entryFrom > 0 ? selWin : null
        );
        const snap = buildDecisionSnapshot({
          ticker,
          today,
          cal: vnHolidayCalendar,
          stats,
          offsets,
          eventPaths: ctx.cyclePaths.eventPaths,
          stockPrices: appendIntradayBar(ctx.stockPrices ?? [], liveQuotes.get(ticker)),
          benchmarkPrices: benchLive,
          exDate,
          earnings,
          earningsStats,
          avgValue20: ctx.avgValue20 ?? null,
          dividendPriors: priorFor(ticker),
          regime
        });
        const snapToStore = {
          ...snap,
          backtest: stats.windows.map((w) => ({
            id: w.id,
            label: w.label,
            entryFrom: w.entryFrom,
            entryTo: w.entryTo,
            exitOffset: w.exitOffset,
            nEvents: w.nEvents,
            winRate: w.winRate,
            wins: w.wins,
            losses: w.losses,
            netExpectancy: w.netExpectancy,
            netExpectancyLcb: w.netExpectancyLcb,
            fdrQValue: w.fdrQValue,
            oosMeanNet: w.oosMeanNet,
            selected: w.selected && w.id === stats.selectedWindowId
          }))
        };
        const rec = snap.recommendation;
        const sel = selectedWindow(stats);
        const baseConfidence = sel ? sel.nEvents >= 12 && (sel.oosMeanNet ?? -1) > 0 ? "HIGH" : sel.nEvents >= 8 ? "MEDIUM" : "LOW" : null;
        const timingRow = {
          ticker,
          action: rec.action,
          tdToEx: rec.tdToEx,
          windowEntryFrom: sel?.entryFrom ?? null,
          windowEntryTo: sel?.entryTo ?? null,
          windowExitOffset: sel?.exitOffset ?? null,
          expectedNetReturn: sel?.netExpectancyLcb ?? null,
          nEvents: sel?.nEvents ?? null,
          fdrQValue: sel?.fdrQValue ?? null,
          confidence: rec.confidence ?? baseConfidence,
          generatedAt: now
        };
        timingOut.push(timingRow);
        savedCount++;
        const decisionRow = {
          ticker,
          level: snap.decision.level,
          action: rec.action,
          combinedProbability: snap.decision.combinedProbability,
          snapshot: toJson(snapToStore),
          computedAt: now
        };
        decisionOut.push(decisionRow);
        decisionCount++;
        levels[snap.decision.level] = (levels[snap.decision.level] ?? 0) + 1;
        const existing = tracksBy.get(ticker) ?? [];
        for (const r of planResolutions(existing, ctx.stockPrices ?? [], ctx.benchmarkPrices ?? benchmarkPrices)) {
          trackOut.push({ id: r.id, ticker, outcome: r.outcome, realizedCar: r.realizedCar, exitDate: r.exitDate, outcomeRecordedAt: now });
          resolvedCount++;
        }
        const issue = planIssue(snap, existing, vnHolidayCalendar, now.toISOString());
        if (issue) {
          trackOut.push({
            id: issue.id,
            ticker,
            windowId: issue.windowId,
            level: issue.level,
            predictedProbability: issue.predictedProbability,
            components: toJson(issue.components),
            exDate: issue.exDate,
            exDateStatus: issue.exDateStatus,
            entryDate: issue.entryDate,
            plannedExitDate: issue.plannedExitDate,
            issuedAt: now,
            outcome: null,
            realizedCar: null,
            exitDate: null,
            outcomeRecordedAt: null
          });
          issuedCount++;
        }
      } catch (e) {
        errors.push(`${ticker}: ${e instanceof Error ? e.message : String(e)}`);
        console.error(`[timing-signals-scan] decision ${ticker}:`, e);
      }
    }
    for (const ticker of noHistory) {
      const row = {
        ticker,
        action: "NO_DATE",
        tdToEx: null,
        windowEntryFrom: null,
        windowEntryTo: null,
        windowExitOffset: null,
        expectedNetReturn: null,
        nEvents: null,
        fdrQValue: null,
        confidence: null,
        generatedAt: now
      };
      timingOut.push(row);
    }
    wrote = true;
    await storeUpsert("timing", timingOut);
    await storeUpsert("decision", decisionOut);
    if (trackOut.length) await storeUpsert("track", trackOut);
    await storeUpsert("meta", [{ key: "universe", tickers: universe.tickers.map((t) => [t.ticker, t.sector]), source: universe.source, at: now }]);
    const nextOffset = offset + limit >= allTickers.length ? 0 : offset + limit;
    await bumpCotucDataVersion();
    return jobOk({
      store: "gateway",
      savedCount,
      skippedCount,
      noDividendHistory: noHistory.length,
      decisionCount,
      levels,
      regime: regime.regime,
      issuedCount,
      resolvedCount,
      errors,
      processedInThisCall: tickers.length,
      offset,
      limit,
      nextOffset,
      totalTickers: allTickers.length,
      universeSource: universe.source,
      intraday: { quotes: liveQuotes.size, index: liveIndex },
      today
    });
  } catch (err) {
    console.error("[api/cron/timing-signals-scan] L\u1ED7i:", err);
    if (wrote) await bumpCotucDataVersion();
    return jobFail({ error: "Kh\xF4ng qu\xE9t \u0111\u01B0\u1EE3c Timing Signals.", detail: err instanceof Error ? err.message.slice(0, 200) : null });
  }
}

// lib/quant-data.ts
var stockUniverse = [
  { ticker: "FPT", sector: "Cong nghe", epsGrowth: 24.5, faScore: 92 },
  { ticker: "PVS", sector: "Dau khi", epsGrowth: 18.2, faScore: 86 },
  { ticker: "TCB", sector: "Ngan hang", epsGrowth: 15.8, faScore: 84 },
  { ticker: "HAH", sector: "Van tai bien", epsGrowth: 32.1, faScore: 88 },
  { ticker: "DGC", sector: "Hoa chat", epsGrowth: 21.4, faScore: 85 },
  { ticker: "GVR", sector: "Cao su", epsGrowth: 19.6, faScore: 83 },
  { ticker: "MWG", sector: "Ban le", epsGrowth: 28.3, faScore: 81 },
  { ticker: "STB", sector: "Ngan hang", epsGrowth: 14.2, faScore: 79 },
  { ticker: "NLG", sector: "Bat dong san", epsGrowth: 12.5, faScore: 78 },
  { ticker: "HPG", sector: "Thep", epsGrowth: 16.8, faScore: 77 },
  { ticker: "VCB", sector: "Ngan hang", epsGrowth: 13.1, faScore: 82 },
  { ticker: "VHM", sector: "Bat dong san", epsGrowth: 9.4, faScore: 70 },
  { ticker: "VIC", sector: "Bat dong san", epsGrowth: 7.2, faScore: 65 },
  { ticker: "MBB", sector: "Ngan hang", epsGrowth: 17.5, faScore: 80 },
  { ticker: "ACB", sector: "Ngan hang", epsGrowth: 14.9, faScore: 76 },
  { ticker: "CTG", sector: "Ngan hang", epsGrowth: 11.3, faScore: 71 },
  { ticker: "VPB", sector: "Ngan hang", epsGrowth: 10.7, faScore: 68 },
  { ticker: "SSI", sector: "Chung khoan", epsGrowth: 26.4, faScore: 79 },
  { ticker: "HCM", sector: "Chung khoan", epsGrowth: 22.1, faScore: 75 },
  { ticker: "VND", sector: "Chung khoan", epsGrowth: 20.8, faScore: 73 },
  { ticker: "PVD", sector: "Dau khi", epsGrowth: 16.5, faScore: 74 },
  { ticker: "GAS", sector: "Dau khi", epsGrowth: 8.9, faScore: 66 },
  { ticker: "PLX", sector: "Dau khi", epsGrowth: 6.4, faScore: 60 },
  { ticker: "PHR", sector: "Cao su", epsGrowth: 15.3, faScore: 72 },
  { ticker: "DPR", sector: "Cao su", epsGrowth: 13.8, faScore: 69 },
  { ticker: "HSG", sector: "Thep", epsGrowth: 12.1, faScore: 67 },
  { ticker: "NKG", sector: "Thep", epsGrowth: 10.5, faScore: 64 },
  { ticker: "GMD", sector: "Van tai bien", epsGrowth: 18.9, faScore: 77 },
  { ticker: "VOS", sector: "Van tai bien", epsGrowth: 25.6, faScore: 70 },
  { ticker: "PVT", sector: "Van tai bien", epsGrowth: 14.7, faScore: 71 },
  { ticker: "KDH", sector: "Bat dong san", epsGrowth: 8.1, faScore: 62 },
  { ticker: "DXG", sector: "Bat dong san", epsGrowth: 5.4, faScore: 55 },
  { ticker: "PDR", sector: "Bat dong san", epsGrowth: 4.2, faScore: 50 },
  { ticker: "DPM", sector: "Phan bon/Hoa chat", epsGrowth: -3.5, faScore: 48 },
  { ticker: "DCM", sector: "Phan bon/Hoa chat", epsGrowth: -1.8, faScore: 52 },
  { ticker: "VRE", sector: "Ban le", epsGrowth: 9.7, faScore: 63 },
  { ticker: "PNJ", sector: "Ban le", epsGrowth: 17.2, faScore: 76 },
  { ticker: "FRT", sector: "Ban le", epsGrowth: 22.9, faScore: 73 },
  { ticker: "REE", sector: "Nang luong/Dien", epsGrowth: 11.6, faScore: 68 },
  { ticker: "POW", sector: "Nang luong/Dien", epsGrowth: 6.8, faScore: 58 },
  { ticker: "NT2", sector: "Nang luong/Dien", epsGrowth: 5.1, faScore: 54 },
  { ticker: "VSH", sector: "Nang luong/Dien", epsGrowth: 13.4, faScore: 65 },
  { ticker: "VJC", sector: "Hang khong", epsGrowth: 19.3, faScore: 71 },
  { ticker: "HVN", sector: "Hang khong", epsGrowth: -8.2, faScore: 40 },
  { ticker: "GEX", sector: "Khu cong nghiep", epsGrowth: 16.1, faScore: 70 },
  { ticker: "KBC", sector: "Khu cong nghiep", epsGrowth: 14.5, faScore: 72 },
  { ticker: "IDC", sector: "Khu cong nghiep", epsGrowth: 12.8, faScore: 69 },
  { ticker: "SZC", sector: "Khu cong nghiep", epsGrowth: 10.2, faScore: 64 },
  { ticker: "BCM", sector: "Khu cong nghiep", epsGrowth: 8.6, faScore: 61 },
  { ticker: "TNG", sector: "Det may", epsGrowth: 23.7, faScore: 74 },
  { ticker: "MSH", sector: "Det may", epsGrowth: 18.4, faScore: 70 },
  { ticker: "STK", sector: "Det may", epsGrowth: 9.9, faScore: 59 },
  { ticker: "VHC", sector: "Xuat khau (Go, Thuy san)", epsGrowth: 20.6, faScore: 75 },
  { ticker: "ANV", sector: "Xuat khau (Go, Thuy san)", epsGrowth: 15.9, faScore: 68 },
  { ticker: "FMC", sector: "Xuat khau (Go, Thuy san)", epsGrowth: 13.2, faScore: 66 },
  { ticker: "IMP", sector: "Duoc pham", epsGrowth: 11.1, faScore: 63 },
  { ticker: "DHG", sector: "Duoc pham", epsGrowth: 7.5, faScore: 57 },
  { ticker: "DBC", sector: "Nong nghiep", epsGrowth: 26.8, faScore: 72 },
  { ticker: "HNG", sector: "Nong nghiep", epsGrowth: -12.4, faScore: 35 },
  { ticker: "BMP", sector: "Vat lieu xay dung", epsGrowth: 14.3, faScore: 67 },
  { ticker: "HT1", sector: "Vat lieu xay dung", epsGrowth: 3.8, faScore: 48 }
];

// lib/cotuc/vci-financials-adapter.ts
var IQ_BASE_URL2 = "https://iq.vietcap.com.vn/api/iq-insight-service";
async function fetchQuarterlyIncome(ticker) {
  try {
    const url = `${IQ_BASE_URL2}/v1/company/${ticker}/financial-statement?section=INCOME_STATEMENT&period=quarterly`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store"
    });
    if (!res.ok) {
      return { ticker, available: false, quarters: [], error: `VCI HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Kh\xF4ng r\xF5 nguy\xEAn nh\xE2n";
      return { ticker, available: false, quarters: [], error: `VCI b\xE1o l\u1ED7i: ${String(reason).slice(0, 150)}` };
    }
    const rawRows = Array.isArray(json?.data?.quarters) ? json.data.quarters : [];
    const quarters = rawRows.map((row) => {
      const year = Number(row.yearReport);
      const quarter = Number(row.lengthReport);
      if (!year || !quarter || quarter < 1 || quarter > 4) return null;
      const revenue = row.isa1 ?? null;
      const netProfit = row.isa22 ?? null;
      const eps = row.isa23 ?? null;
      const cogs = row.isa4 ?? null;
      const grossProfit = row.isa5 ?? null;
      return {
        ticker,
        year,
        quarter,
        revenue: revenue !== null ? Number(revenue) : null,
        netProfit: netProfit !== null ? Number(netProfit) : null,
        eps: eps !== null ? Number(eps) : null,
        cogs: cogs !== null ? Number(cogs) : null,
        grossProfit: grossProfit !== null ? Number(grossProfit) : null,
        periodLabel: `Q${quarter}/${year}`
      };
    }).filter((r) => r !== null).sort((a, b) => b.year - a.year || b.quarter - a.quarter);
    if (quarters.length === 0) {
      return { ticker, available: false, quarters: [], error: "VCI tr\u1EA3 v\u1EC1 th\xE0nh c\xF4ng nh\u01B0ng kh\xF4ng c\xF3 d\xF2ng qu\xFD h\u1EE3p l\u1EC7 n\xE0o" };
    }
    return { ticker, available: true, quarters };
  } catch (err) {
    return { ticker, available: false, quarters: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// lib/cotuc/cafef-earnings-disclosure-scraper.ts
var CAFEF_BASE = "https://cafef.vn/du-lieu/tin-doanh-nghiep";
var QUARTERLY_TITLE_RE = /bao cao tai chinh quy\s*(\d)\s*\/?\s*(\d{4})/i;
function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function parseCafefDate(dd, mm, yyyy) {
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  if (!d || !m || !y) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
async function fetchEarningsDisclosureHistory(ticker) {
  try {
    const url = `${CAFEF_BASE}/${encodeURIComponent(ticker)}/event.chn`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store"
    });
    if (!res.ok) {
      return { ticker, success: false, records: [], error: `CafeF tra ve HTTP ${res.status}` };
    }
    const html = await res.text();
    const lineRe = /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/g;
    const records = [];
    let match;
    while ((match = lineRe.exec(html)) !== null) {
      const [, dd, mm, yyyy, rawTitle] = match;
      const title = stripDiacritics(rawTitle);
      const m2 = QUARTERLY_TITLE_RE.exec(stripDiacritics(rawTitle));
      if (!m2) continue;
      const quarter = Number(m2[1]);
      const year = Number(m2[2]);
      if (quarter < 1 || quarter > 4) continue;
      const announceDate = parseCafefDate(dd, mm, yyyy);
      if (!announceDate) continue;
      records.push({
        year,
        quarter,
        isParentOnly: title.includes("cong ty me"),
        announceDate
      });
    }
    if (records.length === 0) {
      return { ticker, success: false, records: [], error: "Khong tim thay dong 'bao cao tai chinh quy' nao tren trang CafeF" };
    }
    return { ticker, success: true, records };
  } catch (err) {
    return { ticker, success: false, records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// lib/cotuc/timing-v3/earnings-signal.ts
var DEFAULT_LAG_WINDOW = 8;
var DEFAULT_MIN_QUARTERS_FOR_LAG = 4;
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function madStd(xs) {
  if (xs.length === 0) return 0;
  const m = median(xs);
  const dev = xs.map((x) => Math.abs(x - m));
  return 1.4826 * median(dev);
}
function estimateAnnounceDate(historicalRecords, targetLegalDeadline, opts = {}) {
  const lagWindow = opts.lagWindowQuarters ?? DEFAULT_LAG_WINDOW;
  const minQuarters = opts.minQuartersForLag ?? DEFAULT_MIN_QUARTERS_FOR_LAG;
  const lags = [];
  for (const r of historicalRecords) {
    if (!r.announceDate) continue;
    const dl = toDayNumber(r.legalDeadline);
    const an = toDayNumber(r.announceDate);
    if (dl === null || an === null) continue;
    lags.push(dl - an);
  }
  const recent = lags.slice(-lagWindow);
  const deadlineDay = toDayNumber(targetLegalDeadline);
  if (deadlineDay === null) {
    return { date: targetLegalDeadline, method: "DEADLINE_ONLY", lagStdDays: null };
  }
  if (recent.length < minQuarters) {
    return { date: targetLegalDeadline, method: "DEADLINE_ONLY", lagStdDays: null };
  }
  const lagMedian = median(recent);
  const lagStd = madStd(recent);
  const announceDay = deadlineDay - Math.round(lagMedian);
  return { date: dayNumberToIso(announceDay), method: "HISTORICAL_LAG", lagStdDays: lagStd };
}
function computeSue(series, currentActual, minHistory = 8) {
  if (currentActual === null) return { sue: null, yoyGrowth: null, quality: "THIN_HISTORY" };
  if (series.length < 5) return { sue: null, yoyGrowth: null, quality: "THIN_HISTORY" };
  const laggedSameQuarter = series[series.length - 4];
  if (laggedSameQuarter === void 0) return { sue: null, yoyGrowth: null, quality: "THIN_HISTORY" };
  const yoyGrowth = laggedSameQuarter !== 0 ? currentActual / laggedSameQuarter - 1 : null;
  if (Math.abs(laggedSameQuarter) < 1e-9 || laggedSameQuarter < 0) {
    return { sue: null, yoyGrowth: null, quality: "NEGATIVE_BASE" };
  }
  const yoyDiffs = [];
  for (let i = 4; i < series.length; i++) {
    const base = series[i - 4];
    if (base > 0) yoyDiffs.push(series[i] - base);
  }
  const drift = yoyDiffs.length ? yoyDiffs.reduce((a, b) => a + b, 0) / yoyDiffs.length : 0;
  const ue = currentActual - laggedSameQuarter - drift;
  const history = series.length >= minHistory ? series.slice(-minHistory) : series;
  const ueHistory = [];
  for (let i = 4; i < history.length; i++) {
    const base = history[i - 4];
    if (base > 0) ueHistory.push(history[i] - base - drift);
  }
  const sigma = Math.sqrt(sampleVar(ueHistory));
  if (sigma === 0 || ueHistory.length < 3) return { sue: null, yoyGrowth, quality: "THIN_HISTORY" };
  const sue = ue / sigma;
  return { sue, yoyGrowth, quality: series.length >= minHistory ? "OK" : "THIN_HISTORY" };
}
function sampleVar(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}
function buildEarningsSignal(input) {
  const expectedAnnounce = estimateAnnounceDate(input.history, input.target.legalDeadline);
  const series = input.history.map((h) => h.earningsMetric).filter((x) => x !== null);
  const currentActual = input.target.announceDate ? input.target.earningsMetric : null;
  const sueResult = computeSue(series, currentActual);
  const extraordinaryShare = input.target.extraordinaryShare ?? null;
  let quality = sueResult.quality;
  if (extraordinaryShare !== null && extraordinaryShare >= 0.3) {
    quality = "DISTORTED";
  }
  return {
    ticker: input.ticker,
    isBank: input.isBank,
    quarterLabel: input.target.quarterLabel,
    legalDeadline: input.target.legalDeadline,
    expectedAnnounce,
    sue: quality === "OK" ? sueResult.sue : null,
    revenueGrowthYoY: input.revenueGrowthYoY,
    profitGrowthYoY: input.profitGrowthYoY,
    profitTtmGrowthYoY: input.profitTtmGrowthYoY,
    extraordinaryShare,
    quality,
    version: input.version,
    asOf: input.asOf
  };
}

// lib/cotuc/timing-v3/earnings-signal-io.ts
function getQuarterEndDate(year, quarter) {
  const endMonth = quarter * 3;
  return new Date(Date.UTC(year, endMonth, 0));
}
function legalDeadlineFor(year, quarter) {
  const quarterEnd = getQuarterEndDate(year, quarter);
  const deadline = new Date(quarterEnd);
  deadline.setUTCDate(deadline.getUTCDate() + 45);
  return deadline.toISOString().slice(0, 10);
}
function pickConsolidated(records) {
  const map = /* @__PURE__ */ new Map();
  for (const r of records) {
    const key = `${r.year}-Q${r.quarter}`;
    const existing = map.get(key);
    if (!existing || existing.isParentOnly && !r.isParentOnly) map.set(key, r);
  }
  return map;
}
async function buildEarningsSignalForTicker(ticker, isBank) {
  const vnd = await fetchVndQuarterlyFinancials(ticker);
  const [finRes, discRes] = vnd.available ? [
    { available: true, quarters: vnd.quarters.map((q) => ({ year: q.year, quarter: q.quarter, revenue: q.revenue, netProfit: q.netProfit })), error: void 0 },
    { ticker, success: true, records: vnd.quarters.filter((q) => q.announceDate).map((q) => ({ year: q.year, quarter: q.quarter, isParentOnly: false, announceDate: q.announceDate })) }
  ] : await Promise.all([fetchQuarterlyIncome(ticker), fetchEarningsDisclosureHistory(ticker)]);
  if (!finRes.available || finRes.quarters.length === 0) {
    return { reason: "FINANCIALS_FETCH_FAILED", detail: finRes.error ?? "Khong co du lieu tai chinh tu VCI" };
  }
  const ascending = [...finRes.quarters].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const target = ascending[ascending.length - 1];
  if (!target) return { reason: "NO_TARGET_QUARTER", detail: "Khong xac dinh duoc quy gan nhat" };
  const disclosureMap = discRes.success ? pickConsolidated(discRes.records) : /* @__PURE__ */ new Map();
  const history = ascending.slice(0, -1).map((q) => {
    const key = `${q.year}-Q${q.quarter}`;
    const disc = disclosureMap.get(key);
    return {
      quarterLabel: `Q${q.quarter}/${q.year}`,
      legalDeadline: legalDeadlineFor(q.year, q.quarter),
      announceDate: disc?.announceDate ?? null,
      earningsMetric: q.netProfit,
      extraordinaryShare: null
      // MISSING minh bach - VCI khong cung cap truc tiep, khong bia
    };
  });
  const targetKey = `${target.year}-Q${target.quarter}`;
  const targetDisc = disclosureMap.get(targetKey);
  const targetRecord = {
    quarterLabel: `Q${target.quarter}/${target.year}`,
    legalDeadline: legalDeadlineFor(target.year, target.quarter),
    announceDate: targetDisc?.announceDate ?? null,
    earningsMetric: target.netProfit,
    extraordinaryShare: null
  };
  const idx = ascending.length - 1;
  const yoyBase = ascending[idx - 4];
  const revenueGrowthYoY = yoyBase?.revenue && target.revenue !== null && yoyBase.revenue !== 0 ? target.revenue / yoyBase.revenue - 1 : null;
  const profitGrowthYoY = yoyBase?.netProfit && target.netProfit !== null && yoyBase.netProfit !== 0 ? target.netProfit / yoyBase.netProfit - 1 : null;
  const asOf = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const reported = buildEarningsSignal({
    ticker,
    isBank,
    history,
    target: targetRecord,
    revenueGrowthYoY,
    profitGrowthYoY,
    profitTtmGrowthYoY: null,
    // can 4 quy lien tiep cong don, ngoai pham vi don gian hoa Giai doan 3
    version: "v3-p3",
    asOf
  });
  return toUpcomingSignal(reported, { history, targetRecord, target, ticker, isBank, asOf });
}
function toUpcomingSignal(reported, ctx) {
  if (!ctx.targetRecord.announceDate) return reported;
  const nextQ = ctx.target.quarter === 4 ? 1 : ctx.target.quarter + 1;
  const nextY = ctx.target.quarter === 4 ? ctx.target.year + 1 : ctx.target.year;
  const upcoming = buildEarningsSignal({
    ticker: ctx.ticker,
    isBank: ctx.isBank,
    history: [...ctx.history, ctx.targetRecord],
    target: { quarterLabel: `Q${nextQ}/${nextY}`, legalDeadline: legalDeadlineFor(nextY, nextQ), announceDate: null, earningsMetric: null, extraordinaryShare: null },
    revenueGrowthYoY: null,
    profitGrowthYoY: null,
    profitTtmGrowthYoY: null,
    version: "v3-p3",
    asOf: ctx.asOf
  });
  return {
    ...reported,
    quarterLabel: upcoming.quarterLabel,
    legalDeadline: upcoming.legalDeadline,
    expectedAnnounce: upcoming.expectedAnnounce
  };
}

// lib/cotuc/timing-v3/seasonality/compute-earnings-cycle-stats.ts
function computeIndustryQuarterPrior(samplesPerTicker, costs = DEFAULT_COSTS) {
  const means = [];
  const winRates = [];
  for (const samples of samplesPerTicker) {
    if (samples.length === 0) continue;
    const nets = samples.map((s) => netReturnOfEvent(s, costs));
    means.push(nets.reduce((a, b) => a + b, 0) / nets.length);
    winRates.push(nets.filter((x) => x > 0).length / nets.length);
  }
  if (means.length === 0) {
    return { priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nTickersUsed: 0 };
  }
  const priorMean = means.reduce((a, b) => a + b, 0) / means.length;
  const betweenVarRaw = means.length >= 2 ? sampleVariance(means) : Math.max(priorMean ** 2, 1e-4);
  const { alpha0, beta0 } = estimatePriorFromRates(winRates);
  return {
    priorMean,
    betweenVar: Math.max(betweenVarRaw, 1e-6),
    winRatePriorAlpha0: alpha0,
    winRatePriorBeta0: beta0,
    nTickersUsed: means.length
  };
}
function computeQuarterRaw(quarter, candidates, prior, opts, priorByWindow) {
  const costs = opts.costs ?? DEFAULT_COSTS;
  const computed = candidates.map((c) => {
    const pr = priorByWindow?.[c.id] ?? prior;
    return computeWindowStat(c, {
      costs,
      gating: opts.gating,
      bootstrap: opts.bootstrap,
      priorMean: pr.priorMean,
      betweenVar: pr.betweenVar
    });
  });
  const netsByWindowId = new Map(candidates.map((c) => [c.id, c.samples.map((s) => netReturnOfEvent(s, costs))]));
  return { quarter, computed, netsByWindowId, prior, priorByWindow };
}
function computeFullYearEarningsCycleStats(ticker, byQuarter, opts) {
  const gating = opts.gating ?? DEFAULT_GATING;
  const quarters = [1, 2, 3, 4];
  const perQuarter = quarters.map((q) => computeQuarterRaw(q, byQuarter[q].candidates, byQuarter[q].prior, opts, byQuarter[q].priorByWindow));
  const allComputed = perQuarter.flatMap((p) => p.computed);
  const allWindows = computeFdrAcrossWindows(allComputed, gating);
  const result = {};
  let cursor = 0;
  for (const p of perQuarter) {
    const windows = allWindows.slice(cursor, cursor + p.computed.length);
    cursor += p.computed.length;
    const eligible = windows.filter((w) => w.selected);
    const best = eligible.reduce(
      (acc, w) => acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc,
      null
    );
    let reactionProbability = null;
    if (best) {
      const nets = p.netsByWindowId.get(best.id) ?? [];
      const wins = nets.filter((x) => x > 0).length;
      const losses = nets.length - wins;
      const pr = p.priorByWindow?.[best.id] ?? p.prior;
      reactionProbability = betaBinomialPosterior(wins, losses, pr.winRatePriorAlpha0, pr.winRatePriorBeta0, gating.confidenceLevel);
    }
    result[p.quarter] = {
      ticker,
      version: opts.version,
      asOf: opts.asOf,
      eventType: "EARNINGS",
      quarter: p.quarter,
      windows,
      selectedWindowId: best?.id ?? null,
      adjustedPriceBasis: "ADJ_CLOSE",
      benchmark: opts.benchmark ?? "VNINDEX",
      reactionProbability
    };
  }
  return result;
}

// lib/cotuc/timing-v3/seasonality/announce-date-model.ts
var WEAK_ANNOUNCE_PRIOR = { mu0: 30, kappa0: 1, a0: 1.5, b0: 1.5 * 15 * 15 };
function announcePredictive(offsetsDays, prior = WEAK_ANNOUNCE_PRIOR) {
  const xs = offsetsDays.filter((v) => Number.isFinite(v));
  const n = xs.length;
  const kappaN = prior.kappa0 + n;
  const aN = prior.a0 + n / 2;
  if (n === 0) {
    const scale2 = Math.sqrt(prior.b0 * (prior.kappa0 + 1) / (prior.a0 * prior.kappa0));
    return { mu: prior.mu0, scale: scale2, dof: 2 * prior.a0, n: 0 };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const ss = xs.reduce((a, b) => a + (b - mean) ** 2, 0);
  const muN = (prior.kappa0 * prior.mu0 + n * mean) / kappaN;
  const bN = prior.b0 + 0.5 * ss + prior.kappa0 * n * (mean - prior.mu0) ** 2 / (2 * kappaN);
  const scale = Math.sqrt(bN * (kappaN + 1) / (aN * kappaN));
  return { mu: muN, scale, dof: 2 * aN, n };
}
function announceQuantile(m, p) {
  if (p <= 0 || p >= 1) throw new Error("announceQuantile: p ph\u1EA3i trong (0,1)");
  if (p === 0.5) return m.mu;
  const upper = p > 0.5;
  const tail = upper ? 1 - p : p;
  const x = invertRegularizedIncompleteBeta(2 * tail, m.dof / 2, 0.5);
  const absT = x <= 0 ? Infinity : Math.sqrt(m.dof * (1 - x) / x);
  return m.mu + (upper ? 1 : -1) * absT * m.scale;
}
function announceCredibleInterval(m, level = 0.9) {
  return [announceQuantile(m, (1 - level) / 2), announceQuantile(m, (1 + level) / 2)];
}

// lib/cotuc/timing-v3/seasonality/compute-annual-earnings-calendar.ts
var FISCAL_QUARTER_END = {
  1: { month: 3, day: 31 },
  2: { month: 6, day: 30 },
  3: { month: 9, day: 30 },
  4: { month: 12, day: 31 }
};
function parseIsoUtc(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}
function daysAfterFiscalQuarterEnd(announceIso, quarter) {
  const parsed = parseIsoUtc(announceIso);
  if (!parsed) return null;
  const { month, day } = FISCAL_QUARTER_END[quarter];
  const fiscalYear = quarter === 4 && parsed.m <= 3 ? parsed.y - 1 : parsed.y;
  const endTs = Date.UTC(fiscalYear, month - 1, day);
  const announceTs = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
  return (announceTs - endTs) / 864e5;
}
function median2(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function typicalMonthFromOffset(quarter, medianOffsetDays) {
  const { month, day } = FISCAL_QUARTER_END[quarter];
  const REFERENCE_YEAR = 2001;
  const endTs = Date.UTC(REFERENCE_YEAR, month - 1, day);
  const resultTs = endTs + medianOffsetDays * 864e5;
  return new Date(resultTs).getUTCMonth() + 1;
}
function computeAnnualEarningsCalendar(input) {
  const minEvents = input.minEventsForConfirmed ?? 3;
  const quarters = [1, 2, 3, 4].map((quarter) => {
    const dates = input.historicalAnnounceDatesByQuarter[quarter] ?? [];
    const offsets = dates.map((d) => daysAfterFiscalQuarterEnd(d, quarter)).filter((v) => v !== null);
    const stats = input.earningsCycleStatsByQuarter[quarter];
    const reactionProbability = stats?.reactionProbability ?? null;
    const predictive = announcePredictive(offsets, input.announcePriorByQuarter?.[quarter]);
    const announceModel = {
      mu: predictive.mu,
      scale: predictive.scale,
      dof: predictive.dof,
      n: predictive.n,
      ci90: announceCredibleInterval(predictive, 0.9)
    };
    if (offsets.length === 0) {
      return {
        quarter,
        typicalAnnounceMonth: typicalMonthFromOffset(quarter, 30),
        // ước lượng thô: ~1 tháng sau kỳ báo cáo
        announceMonthStd: 0,
        reactionProbability,
        nEvents: 0,
        dataStatus: "ESTIMATED",
        announceModel
      };
    }
    const medianOffsetDays = median2(offsets);
    const stdDays = offsets.length >= 2 ? Math.sqrt(sampleVariance(offsets)) : 0;
    return {
      quarter,
      typicalAnnounceMonth: typicalMonthFromOffset(quarter, medianOffsetDays),
      announceMonthStd: stdDays / 30.44,
      reactionProbability,
      nEvents: offsets.length,
      dataStatus: offsets.length >= minEvents ? "CONFIRMED" : "ESTIMATED",
      announceModel
    };
  });
  return { ticker: input.ticker, version: input.version, asOf: input.asOf, quarters };
}

// lib/cotuc/timing-v3/seasonality/earnings-windows.ts
var EARNINGS_CANDIDATE_WINDOWS = [
  { id: "e1", label: "E1 \xB7 Ch\u1EA1y tr\u01B0\u1EDBc c\xF4ng b\u1ED1", entryFrom: -15, entryTo: -10, exitOffset: -1, holdsThroughEx: false },
  { id: "e2", label: "E2 \xB7 N\u1EAFm qua c\xF4ng b\u1ED1", entryFrom: -5, entryTo: -2, exitOffset: 3, holdsThroughEx: true },
  { id: "e3", label: "E3 \xB7 Ng\u1EAFn sau c\xF4ng b\u1ED1", entryFrom: 1, entryTo: 2, exitOffset: 7, holdsThroughEx: false },
  { id: "e4", label: "E4 \xB7 Tr\xF4i gi\xE1 sau c\xF4ng b\u1ED1 (PEAD)", entryFrom: 1, entryTo: 3, exitOffset: 20, holdsThroughEx: false }
];
function buildEarningsOffsets() {
  const set = /* @__PURE__ */ new Set([0]);
  for (const w of EARNINGS_CANDIDATE_WINDOWS) {
    set.add(w.entryFrom);
    set.add(w.entryTo);
    set.add(w.exitOffset);
  }
  return [...set].sort((a, b) => a - b);
}

// lib/cotuc/timing-v3/seasonality/seasonality-io.ts
var SEASONALITY_VERSION = "v3-seasonality-1";
var QUARTERS = [1, 2, 3, 4];
var MIN_PEERS_FOR_INDUSTRY_PRIOR = 3;
function pickAnnounceDates(records) {
  const best = /* @__PURE__ */ new Map();
  for (const r of records) {
    if (!(r.quarter >= 1 && r.quarter <= 4) || !/^\d{4}-\d{2}-\d{2}$/.test(r.announceDate)) continue;
    const key = `${r.year}-${r.quarter}`;
    const cur = best.get(key);
    if (!cur || cur.isParentOnly && !r.isParentOnly) best.set(key, r);
  }
  const out = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of best.values()) out[String(r.quarter)].push(r.announceDate);
  for (const q of Object.keys(out)) out[q] = [...new Set(out[q])].sort();
  return out;
}
function buildSeasonalitySamples(ticker, stock, bench, announce, asOf) {
  const offsets = buildEarningsOffsets();
  const offsetIndex = new Map(offsets.map((o, i) => [o, i]));
  const stockDates = new Set(stock.map((p) => p.date));
  const cal = makeTradingCalendarFromPrices(bench.map((p) => p.date).filter((d) => stockDates.has(d)));
  const samples = {};
  const paths = {};
  let skipped = 0;
  const sessions = bench.map((p) => p.date).filter((d) => stockDates.has(d)).sort();
  const toSession = (d) => {
    let lo = 0, hi = sessions.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (sessions[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return sessions[lo] ?? null;
  };
  for (const q of QUARTERS) {
    const dates = [...new Set((announce[String(q)] ?? []).map(toSession).filter((d) => d !== null))];
    samples[String(q)] = Object.fromEntries(EARNINGS_CANDIDATE_WINDOWS.map((w) => [w.id, []]));
    if (!dates.length) continue;
    const out = computeCyclePaths({
      ticker,
      stockPrices: stock,
      benchmarkPrices: bench,
      events: dates.map((exDate) => ({ exDate })),
      offsets,
      cal,
      currentExDate: null,
      version: SEASONALITY_VERSION,
      asOf
    });
    skipped += out.skippedEvents.length;
    paths[String(q)] = toCyclePathsV3(out);
    for (const w of EARNINGS_CANDIDATE_WINDOWS) {
      const ei = offsetIndex.get(w.entryTo), xi = offsetIndex.get(w.exitOffset);
      for (const ep of out.eventPaths) {
        const a = ep.car[ei], b = ep.car[xi];
        if (a === null || b === null) continue;
        samples[String(q)][w.id].push({ exDate: ep.exDate, carAtEntry: a, carAtExit: b, netDividendYield: 0, year: Number(ep.exDate.slice(0, 4)) });
      }
    }
  }
  return { samples, paths, skipped };
}
async function fetchAnnounceDates(ticker) {
  const vnd = await fetchVndQuarterlyFinancials(ticker);
  const fromVnd = vnd.quarters.filter((q) => q.announceDate).map((q) => ({ year: q.year, quarter: q.quarter, isParentOnly: false, announceDate: q.announceDate }));
  if (vnd.available && fromVnd.length) return { ok: true, announce: pickAnnounceDates(fromVnd), source: "VNDIRECT" };
  const r = await fetchEarningsDisclosureHistory(ticker);
  if (!r.success) return { ok: false, announce: { 1: [], 2: [], 3: [], 4: [] }, error: `VNDirect: ${vnd.error ?? "kh\xF4ng c\xF3 ng\xE0y"}; CafeF: ${r.error ?? "l\u1ED7i"}` };
  return { ok: true, announce: pickAnnounceDates(r.records), source: "CAFEF" };
}
function buildPriors(target, all) {
  const others = all.filter((c) => c.ticker !== target.ticker);
  const sameSector = target.sector ? others.filter((c) => c.sector === target.sector) : [];
  const out = {};
  for (const q of QUARTERS) {
    const withData = (list) => list.filter((c) => EARNINGS_CANDIDATE_WINDOWS.some((w) => (c.samples[String(q)]?.[w.id] ?? []).length > 0));
    const industry = withData(sameSector);
    const peers = industry.length >= MIN_PEERS_FOR_INDUSTRY_PRIOR ? industry : withData(others);
    const scope = industry.length >= MIN_PEERS_FOR_INDUSTRY_PRIOR ? "INDUSTRY" : peers.length ? "UNIVERSE" : "NONE";
    const priorByWindow = Object.fromEntries(EARNINGS_CANDIDATE_WINDOWS.map((w) => [w.id, computeIndustryQuarterPrior(peers.map((c) => c.samples[String(q)]?.[w.id] ?? []))]));
    out[q] = { prior: priorByWindow[EARNINGS_CANDIDATE_WINDOWS[0].id], priorByWindow, scope };
  }
  return out;
}
function finalizeTicker(target, all, asOf) {
  const priors = buildPriors(target, all);
  const byQuarter = {};
  for (const q of QUARTERS) {
    byQuarter[q] = {
      candidates: EARNINGS_CANDIDATE_WINDOWS.map((w) => ({ ...w, samples: target.samples[String(q)]?.[w.id] ?? [] })),
      prior: priors[q].prior,
      priorByWindow: priors[q].priorByWindow
    };
  }
  const stats = computeFullYearEarningsCycleStats(target.ticker, byQuarter, { version: SEASONALITY_VERSION, asOf, benchmark: "VNINDEX" });
  const historical = Object.fromEntries(QUARTERS.map((q) => [q, target.announce[String(q)] ?? []]));
  const calendar = computeAnnualEarningsCalendar({
    ticker: target.ticker,
    version: SEASONALITY_VERSION,
    asOf,
    historicalAnnounceDatesByQuarter: historical,
    earningsCycleStatsByQuarter: stats
  });
  return { stats, calendar, priorScope: Object.fromEntries(QUARTERS.map((q) => [q, priors[q].scope])) };
}

// lib/jobs/earnings-seasonality-scan.ts
var BATCH = 3;
var SEASONALITY_YEARS = 10;
var toJson2 = (v) => JSON.parse(JSON.stringify(v));
async function collect(tickers, meta) {
  const bench = await loadBenchmarkPrices(SEASONALITY_YEARS);
  if (!bench.ok) throw new Error(`Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c VN-Index: ${bench.error}`);
  const asOf = (/* @__PURE__ */ new Date()).toISOString();
  const results = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    await Promise.all(tickers.slice(i, i + BATCH).map(async (ticker) => {
      try {
        const sector = DIVIDEND_STOCKS.find((s) => s.ticker === ticker)?.sector ?? meta.get(ticker)?.sector ?? stockUniverse.find((s) => s.ticker === ticker)?.sector ?? null;
        const isBank = /ng[aâ]n h[aà]ng/i.test(sector ?? "") || stockUniverse.find((s) => s.ticker === ticker)?.sector === "Ngan hang";
        const [prices, ann, signal] = await Promise.all([loadStockPrices(ticker, SEASONALITY_YEARS), fetchAnnounceDates(ticker), buildEarningsSignalForTicker(ticker, isBank)]);
        if (!prices.ok) {
          results.push({ ticker, ok: false, detail: `gi\xE1: ${prices.error}` });
          return;
        }
        if (!ann.ok) {
          results.push({ ticker, ok: false, detail: `ng\xE0y c\xF4ng b\u1ED1: ${ann.error}` });
          return;
        }
        const built = buildSeasonalitySamples(ticker, prices.prices, bench.prices, ann.announce, asOf);
        const notes = [...prices.notes, ...bench.notes, built.skipped ? `B\u1ECF qua ${built.skipped} k\u1EF3 c\xF4ng b\u1ED1 thi\u1EBFu d\u1EEF li\u1EC7u gi\xE1 quanh ng\xE0y c\xF4ng b\u1ED1.` : null].filter(Boolean);
        const data = {
          sector,
          announceDates: toJson2(ann.announce),
          samples: toJson2(built.samples),
          paths: toJson2(built.paths),
          earningsSignal: "reason" in signal ? null : toJson2(signal),
          priceSource: prices.source,
          notes: toJson2(notes),
          collectedAt: /* @__PURE__ */ new Date()
        };
        await storeUpsert("season", [{ ticker, ...data }]);
        const n = QUARTERS.reduce((s, q) => s + (ann.announce[String(q)]?.length ?? 0), 0);
        results.push({ ticker, ok: true, detail: `${n} k\u1EF3 c\xF4ng b\u1ED1 \xB7 gi\xE1 ${prices.source}` });
      } catch (e) {
        results.push({ ticker, ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }));
  }
  return results;
}
async function finalize() {
  const rows = await storeList("season", {
    fields: ["ticker", "sector", "samples", "announceDates", "notes"]
  });
  const all = rows.map((r) => ({
    ticker: r.ticker,
    sector: r.sector,
    samples: r.samples,
    announce: r.announceDates
  }));
  const asOf = (/* @__PURE__ */ new Date()).toISOString();
  let done = 0;
  const out = [];
  for (const t of all) {
    const { stats, calendar, priorScope } = finalizeTicker(t, all, asOf);
    const row = rows.find((r) => r.ticker === t.ticker);
    const baseNotes = (row.notes ?? []).filter((n) => !n.startsWith("Prior "));
    out.push({
      ticker: t.ticker,
      stats: toJson2(stats),
      calendar: toJson2(calendar),
      finalizedAt: /* @__PURE__ */ new Date(),
      notes: toJson2([...baseNotes, `Prior theo qu\xFD: ${QUARTERS.map((q) => `Q${q} ${priorScope[q] === "INDUSTRY" ? "c\xF9ng ng\xE0nh" : priorScope[q] === "UNIVERSE" ? "c\u1EA3 danh m\u1EE5c" : "trung t\xEDnh"}`).join(", ")}.`])
    });
    done++;
  }
  await storeUpsert("season", out);
  return { finalized: done };
}
async function runEarningsSeasonalityScan(params = {}) {
  try {
    return await handle(params);
  } finally {
    await bumpCotucDataVersion();
  }
}
async function handle(params) {
  try {
    const phase = params.phase ?? null;
    const offset = Number(params.offset ?? 0);
    const limit = Math.max(1, Math.min(10, Number(params.limit ?? 3)));
    if (phase === "finalize") return jobOk(await finalize());
    const universe = await getCotucUniverse();
    const all = universe.tickers.map((t) => t.ticker);
    const tickers = all.slice(offset, offset + limit);
    const collected = await collect(tickers, new Map(universe.tickers.map((t) => [t.ticker, t])));
    const nextOffset = offset + limit >= all.length ? 0 : offset + limit;
    if (phase === "collect") return jobOk({ collected, offset, limit, nextOffset, totalTickers: all.length, universeSource: universe.source });
    return jobOk({ collected, ...await finalize() });
  } catch (e) {
    return jobFail({ error: e instanceof Error ? e.message : String(e) });
  }
}

// lib/locnganh/tracking-store.ts
function toTrack(r) {
  const d = withDates(r, ["issuedAt", "outcomeRecordedAt"]);
  return {
    ...r,
    level: r.level,
    components: r.components ?? [],
    issuedAt: d.issuedAt.toISOString(),
    outcome: r.outcome == null ? null : r.outcome ? 1 : 0,
    outcomeRecordedAt: d.outcomeRecordedAt?.toISOString() ?? null
  };
}

// lib/locnganh/detect-quadrant-transitions.ts
function detectQuadrantTransitions(history, targetQuadrant = "IMPROVING") {
  const out = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (cur.quadrant === targetQuadrant && prev.quadrant !== targetQuadrant) {
      out.push({ sectorKey: cur.sectorKey, date: cur.asOf, fromQuadrant: prev.quadrant, toQuadrant: cur.quadrant });
    }
  }
  return out;
}

// lib/locnganh/compute-sector-cycle-stats.ts
function computeIndustryGroupPrior(samplesPerSector, costs = DEFAULT_COSTS) {
  const means = [];
  const winRates = [];
  for (const samples of samplesPerSector) {
    if (samples.length === 0) continue;
    const nets = samples.map((s) => netReturnOfEvent(s, costs));
    means.push(nets.reduce((a, b) => a + b, 0) / nets.length);
    winRates.push(nets.filter((x) => x > 0).length / nets.length);
  }
  if (means.length === 0) {
    return { priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nSectorsUsed: 0 };
  }
  const priorMean = means.reduce((a, b) => a + b, 0) / means.length;
  const betweenVarRaw = means.length >= 2 ? sampleVariance(means) : Math.max(priorMean ** 2, 1e-4);
  const { alpha0, beta0 } = estimatePriorFromRates(winRates);
  return {
    priorMean,
    betweenVar: Math.max(betweenVarRaw, 1e-6),
    winRatePriorAlpha0: alpha0,
    winRatePriorBeta0: beta0,
    nSectorsUsed: means.length
  };
}
function buildEventSamplesFromPaths(offsets, eventPaths, entryFrom, exitOffset) {
  const entryIdx = offsets.indexOf(entryFrom);
  const exitIdx = offsets.indexOf(exitOffset);
  if (entryIdx === -1 || exitIdx === -1) {
    throw new Error(`buildEventSamplesFromPaths: entryFrom=${entryFrom} ho\u1EB7c exitOffset=${exitOffset} kh\xF4ng n\u1EB1m trong offsets \u0111\xE3 t\xEDnh`);
  }
  const out = [];
  for (const ep of eventPaths) {
    const carAtEntry = ep.car[entryIdx];
    const carAtExit = ep.car[exitIdx];
    if (carAtEntry === null || carAtExit === null) continue;
    const year = Number(ep.exDate.slice(0, 4));
    out.push({ exDate: ep.exDate, carAtEntry, carAtExit, netDividendYield: 0, year });
  }
  return out;
}
function computeSectorCycleStats(input) {
  const { sectorKey, targetQuadrant, transitions, sectorPrices, benchmarkPrices, windowDefs, cal, prior, version, asOf } = input;
  const costs = input.costs ?? DEFAULT_COSTS;
  const gating = input.gating ?? DEFAULT_GATING;
  const allOffsets = Array.from(new Set(windowDefs.flatMap((w) => [w.entryFrom, w.exitOffset]))).sort((a, b) => a - b);
  const pathsOutput = computeCyclePaths({
    ticker: sectorKey,
    stockPrices: sectorPrices,
    benchmarkPrices,
    events: transitions.map((t) => ({ exDate: t.date })),
    offsets: allOffsets,
    cal,
    version,
    asOf
  });
  const candidates = windowDefs.map((w) => ({
    id: w.id,
    label: w.label,
    entryFrom: w.entryFrom,
    entryTo: w.entryTo,
    exitOffset: w.exitOffset,
    holdsThroughEx: false,
    samples: buildEventSamplesFromPaths(pathsOutput.offsets, pathsOutput.eventPaths, w.entryFrom, w.exitOffset)
  }));
  const computed = candidates.map(
    (c) => computeWindowStat(c, { costs, gating, bootstrap: input.bootstrap, priorMean: prior.priorMean, betweenVar: prior.betweenVar })
  );
  const windows = computeFdrAcrossWindows(computed, gating);
  const eligible = windows.filter((w) => w.selected);
  const best = eligible.reduce(
    (acc, w) => acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc,
    null
  );
  let reactionProbability = null;
  if (best) {
    const bestCandidate = candidates.find((c) => c.id === best.id);
    const nets = bestCandidate.samples.map((s) => netReturnOfEvent(s, costs));
    const wins = nets.filter((x) => x > 0).length;
    const losses = nets.length - wins;
    reactionProbability = betaBinomialPosterior(wins, losses, prior.winRatePriorAlpha0, prior.winRatePriorBeta0, gating.confidenceLevel);
  }
  return {
    ticker: sectorKey,
    version,
    asOf,
    eventType: "QUADRANT_TRANSITION",
    targetQuadrant,
    windows,
    selectedWindowId: best?.id ?? null,
    adjustedPriceBasis: "ADJ_CLOSE",
    benchmark: input.benchmark ?? "VNINDEX",
    reactionProbability
  };
}

// lib/locnganh/world-context.ts
var WORLD_SIGNAL_WEIGHT = 2;
var ICB_TO_WORLD_SECTOR = {
  "0500": "S_OIL",
  "0530": "S_OIL",
  "0570": "S_OIL",
  "1750": "S_STEEL",
  "2770": "S_PORT",
  "7530": "S_POWER",
  "8300": "S_BANK",
  "8600": "S_RE",
  "8700": "S_SEC",
  "9500": "S_TECH",
  "9530": "S_TECH"
};
function worldContextFor(code, doc) {
  const mapped = ICB_TO_WORLD_SECTOR[code];
  if (!mapped) return null;
  if (!doc) return { sector: mapped, nameVi: mapped, tierA: [], usable: false, probability: null, reason: "Ch\u01B0a l\u1EA5y \u0111\u01B0\u1EE3c t\xEDn hi\u1EC7u t\u1EEB K\u1EBFt n\u1ED1i th\u1EBF gi\u1EDBi.", mapped };
  if (doc.mode !== "real") return { sector: mapped, nameVi: mapped, tierA: [], usable: false, probability: null, reason: "K\u1EBFt n\u1ED1i th\u1EBF gi\u1EDBi \u0111ang d\xF9ng d\u1EEF li\u1EC7u m\xF4 ph\u1ECFng \u2014 kh\xF4ng \u0111\u01B0a v\xE0o quy\u1EBFt \u0111\u1ECBnh.", mapped };
  const s = doc.sectors.find((x) => x.sector === mapped);
  if (!s) return { sector: mapped, nameVi: mapped, tierA: [], usable: false, probability: null, reason: doc.reason ?? "Ch\u01B0a c\xF3 t\xEDn hi\u1EC7u cho ng\xE0nh n\xE0y.", mapped };
  const ok = s.usable && typeof s.probability === "number" && s.probability > 0 && s.probability < 1;
  return { ...s, usable: ok, probability: ok ? s.probability : null, mapped };
}
async function fetchWorldSectorSignals(timeoutMs = 6e4) {
  try {
    const res = await fetch(`${MARKET_GATEWAY_URL}/api/world/sector-signals`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// lib/locnganh/sector-regime-fusion.ts
function confluenceToProbability(confluenceScore) {
  return Math.min(1, Math.max(0, confluenceScore / 100));
}
function fuseMacroAndTrendRegime(macroRegime, trend) {
  if (macroRegime === "RISK_OFF") return "RISK_OFF";
  if (macroRegime === "RISK_ON") return trend.regime === "RISK_OFF" ? "NEUTRAL" : "RISK_ON";
  return trend.regime;
}
var SHRINK_STRENGTH = 4;
var logit2 = (p) => {
  const c = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(c / (1 - c));
};
var invLogit2 = (x) => 1 / (1 + Math.exp(-x));
function applyWorldContext(combined, world, weight) {
  if (!world?.usable || world.probability === null || !(weight > 0)) return combined;
  const kappa = weight / (combined.totalWeight + weight + SHRINK_STRENGTH);
  const delta = kappa * logit2(world.probability);
  return {
    ...combined,
    probability: invLogit2(logit2(combined.probability) + delta),
    contributions: [...combined.contributions, { name: "B\u1ED1i c\u1EA3nh th\u1EBF gi\u1EDBi (ngo\xE0i m\u1EABu)", probability: world.probability, weight, logOdds: logit2(world.probability), share: kappa }],
    totalWeight: combined.totalWeight + weight
  };
}
function fuseSectorSignals(input) {
  const trend = classifyMarketRegime({ closes: input.vnIndexCloses });
  const marketRegime = fuseMacroAndTrendRegime(input.macroRegime, trend);
  const regimeMultiplier = REGIME_WEIGHT_MULTIPLIER[marketRegime];
  const signals = [
    {
      name: "X\xE1c su\u1EA5t outperform (l\u1ECBch s\u1EED)",
      probability: input.reactionProbability,
      weight: input.reactionProbability === null ? 0 : input.reactionProbabilityNEvents * regimeMultiplier
    },
    {
      name: "Confluence Score",
      probability: input.confluence ? confluenceToProbability(input.confluence.confluenceScore) : null,
      weight: input.confluence ? 4 * regimeMultiplier : 0
    }
  ];
  const combined = applyWorldContext(combineLogOdds(signals, { shrinkStrength: SHRINK_STRENGTH }), input.world, WORLD_SIGNAL_WEIGHT * regimeMultiplier);
  return { combined, marketRegime, trendDetail: trend };
}

// lib/locnganh/compute-sector-decision-state.ts
var DEFAULT_SECTOR_DECISION_THRESHOLDS = { favorableProbability: 0.6, watchProbability: 0.5 };
var ACTION_TEXT2 = {
  NO_DATE: "Ch\u01B0a c\xF3 l\u1EA7n chuy\u1EC3n quadrant n\xE0o",
  POST_EX: "\u0110\xE3 qua th\u1EDDi \u0111i\u1EC3m t\u1ED1i \u01B0u c\u1EE7a l\u1EA7n chuy\u1EC3n g\u1EA7n nh\u1EA5t",
  NO_SIGNAL: "Ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng th\u1ED1ng k\xEA",
  TOO_EARLY: "Ch\u01B0a t\u1EDBi v\xF9ng mua",
  IN_WINDOW: "\u0110ang trong v\xF9ng mua",
  WINDOW_PASSED: "\u0110\xE3 qua v\xF9ng mua"
};
var HARD_AVOID_ACTIONS2 = /* @__PURE__ */ new Set(["NO_DATE", "POST_EX", "NO_SIGNAL", "WINDOW_PASSED"]);
function pct3(v) {
  return `${Math.round(v * 100)}%`;
}
function computeSectorDecisionState(input, thresholds = DEFAULT_SECTOR_DECISION_THRESHOLDS) {
  const { action, combined, entryPlan, marketRegime, transitionDateConfirmed, confluenceCorroborates, liquidityOk, world } = input;
  const p = combined.probability;
  const checks = [
    { key: "inWindow", label: "\u0110ang trong v\xF9ng mua", passed: action === "IN_WINDOW", detail: ACTION_TEXT2[action] },
    {
      key: "probability",
      // null = nằm giữa hai ngưỡng (chưa rõ ràng), KHÁC "thiếu dữ liệu" — xem chú thích tương
      // ứng trong compute-decision-state.ts gốc.
      label: "X\xE1c su\u1EA5t t\u1ED5ng h\u1EE3p \u0111\u1EE7 cao",
      passed: p >= thresholds.favorableProbability ? true : p >= thresholds.watchProbability ? null : false,
      detail: `${pct3(p)} (t\u1EEB ${combined.contributions.length} t\xEDn hi\u1EC7u, tr\u1ECDng s\u1ED1 ${combined.totalWeight.toFixed(1)})`
    },
    {
      key: "notRunTooFar",
      label: "RS-Ratio ch\u01B0a ch\u1EA1y tr\u01B0\u1EDBc qu\xE1 xa",
      passed: entryPlan.runTooFar.percentile === null ? null : !entryPlan.runTooFar.hasRunTooFar,
      detail: entryPlan.runTooFar.percentile === null ? "Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u l\u1ECBch s\u1EED \u0111\u1EC3 so s\xE1nh" : `\u1EDE ph\xE2n v\u1ECB ${pct3(entryPlan.runTooFar.percentile)} so v\u1EDBi c\xE1c l\u1EA7n chuy\u1EC3n quadrant tr\u01B0\u1EDBc`
    },
    {
      key: "notInvalidated",
      label: "Ch\u01B0a ch\u1EA1m m\u1EE9c v\xF4 hi\u1EC7u ho\xE1 / h\u1EBFt th\u1EDDi gian",
      passed: !entryPlan.invalidated && !entryPlan.timeStopped,
      detail: entryPlan.invalidated ? "\u0110\xE3 th\u1EE7ng m\u1EE9c v\xF4 hi\u1EC7u ho\xE1 (ATR)" : entryPlan.timeStopped ? "\u0110\xE3 qua \u0111i\u1EC3m tho\xE1t d\u1EF1 ki\u1EBFn" : "C\xF2n trong th\u1EDDi gian h\u1EE3p l\u1EC7"
    },
    {
      key: "dateConfirmed",
      label: "Ng\xE0y chuy\u1EC3n quadrant \u0111\xE3 ch\u1ED1t phi\xEAn",
      passed: transitionDateConfirmed,
      detail: transitionDateConfirmed ? "\u0110\xE3 ch\u1ED1t phi\xEAn" : "D\u1EF1a tr\xEAn d\u1EEF li\u1EC7u RRG trong phi\xEAn, c\xF3 th\u1EC3 \u0111\u1ED5i khi ch\u1ED1t"
    },
    {
      key: "confluenceAgrees",
      label: "Confluence Score kh\xF4ng m\xE2u thu\u1EABn",
      passed: confluenceCorroborates,
      detail: confluenceCorroborates === null ? "Ch\u01B0a c\xF3 Confluence Score" : confluenceCorroborates ? "C\xF9ng chi\u1EC1u" : "Confluence Score \u0111ang \u0111i ng\u01B0\u1EE3c x\xE1c su\u1EA5t th\u1ED1ng k\xEA"
    },
    {
      key: "marketRegime",
      label: "Th\u1ECB tr\u01B0\u1EDDng chung kh\xF4ng x\u1EA5u",
      passed: marketRegime !== "RISK_OFF",
      detail: marketRegime === "RISK_ON" ? "Thu\u1EADn l\u1EE3i" : marketRegime === "NEUTRAL" ? "Trung t\xEDnh" : "\u0110ang ph\xF2ng th\u1EE7 (macro score th\u1EA5p ho\u1EB7c VN-Index d\u01B0\u1EDBi MA d\xE0i h\u1EA1n/bi\u1EBFn \u0111\u1ED9ng cao)"
    },
    {
      key: "liquidity",
      label: "Thanh kho\u1EA3n r\u1ED5 ng\xE0nh \u0111\u1EE7",
      passed: liquidityOk,
      detail: liquidityOk === null ? "Ch\u01B0a ki\u1EC3m tra" : liquidityOk ? "\u0110\u1EE7" : "Th\u1EA5p \u2014 kh\xF3 v\xE0o/ra \u1EDF kh\u1ED1i l\u01B0\u1EE3ng d\u1EF1 ki\u1EBFn"
    }
  ];
  if (world) {
    checks.push({
      key: "worldContext",
      label: "B\u1ED1i c\u1EA3nh th\u1EBF gi\u1EDBi (ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu)",
      passed: world.usable && world.probability !== null && world.probability >= 0.5 ? true : null,
      detail: world.usable && world.probability !== null ? `${world.probability >= 0.5 ? "Thu\u1EADn" : "B\u1EA5t l\u1EE3i"} (${pct3(world.probability)}; li\xEAn k\u1EBFt b\u1EADc A: ${world.tierA.join(", ")}) \u2014 ${world.reason}` : `Ch\u01B0a d\xF9ng trong quy\u1EBFt \u0111\u1ECBnh \u2014 ${world.reason}`
    });
  }
  const hardAvoid = HARD_AVOID_ACTIONS2.has(action) || entryPlan.timeStopped || entryPlan.invalidated;
  let level;
  if (hardAvoid || p < thresholds.watchProbability) {
    level = "AVOID";
  } else if (action === "IN_WINDOW" && p >= thresholds.favorableProbability && checks.every((c) => c.key === "liquidity" || c.key === "worldContext" || c.passed !== false)) {
    level = "FAVORABLE";
  } else {
    level = "WATCH";
  }
  const failedMandatory = checks.filter((c) => c.key !== "liquidity" && c.key !== "worldContext" && c.passed === false);
  const headline = level === "FAVORABLE" ? `Thu\u1EADn l\u1EE3i \u0111\u1EC3 v\xE0o \u2014 x\xE1c su\u1EA5t t\u1ED5ng h\u1EE3p ${pct3(p)}` : level === "WATCH" ? failedMandatory.length > 0 ? `Quan s\xE1t \u2014 c\xF2n thi\u1EBFu: ${failedMandatory.map((c) => c.label).join(", ")}` : "Quan s\xE1t \u2014 ch\u01B0a \u0111\u1EE7 \u0111i\u1EC1u ki\u1EC7n thu\u1EADn l\u1EE3i" : `Ch\u01B0a n\xEAn v\xE0o \u2014 ${ACTION_TEXT2[action]}`;
  return { level, headline, checks, combinedProbability: p, disclaimer: "NOT_INVESTMENT_ADVICE" };
}

// lib/locnganh/scan-sector-opportunities.ts
function scanSectorOpportunities(inputs, options = {}) {
  const minLowerBound = options.minLowerBound ?? 0.5;
  const opportunities = [];
  for (const { sectorKey, stats } of inputs) {
    if (options.targetQuadrant && stats.targetQuadrant !== options.targetQuadrant) continue;
    if (!stats.selectedWindowId || !stats.reactionProbability) continue;
    const window = stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected);
    if (!window) continue;
    const lowerBound = stats.reactionProbability.ci[0];
    if (lowerBound < minLowerBound) continue;
    opportunities.push({
      sectorKey,
      reactionProbabilityLowerBound: lowerBound,
      reactionProbabilityMean: stats.reactionProbability.mean,
      expectedNetReturn: window.netExpectancyLcb,
      nEvents: window.nEvents,
      window: { entryFrom: window.entryFrom, entryTo: window.entryTo, exitOffset: window.exitOffset }
    });
  }
  opportunities.sort((a, b) => b.reactionProbabilityLowerBound - a.reactionProbabilityLowerBound);
  return options.limit !== void 0 ? opportunities.slice(0, options.limit) : opportunities;
}

// lib/locnganh/sector-timing.ts
var SECTOR_TIMING_VERSION = "locnganh-timing/L2";
var TARGET_QUADRANT = "IMPROVING";
var SECTOR_WINDOWS = [
  { id: "E1-3_X10", label: "V\xE0o 1\u20133, tho\xE1t +10", entryFrom: 1, entryTo: 3, exitOffset: 10 },
  { id: "E1-3_X20", label: "V\xE0o 1\u20133, tho\xE1t +20", entryFrom: 1, entryTo: 3, exitOffset: 20 },
  { id: "E1-5_X20", label: "V\xE0o 1\u20135, tho\xE1t +20", entryFrom: 1, entryTo: 5, exitOffset: 20 },
  { id: "E1-5_X40", label: "V\xE0o 1\u20135, tho\xE1t +40", entryFrom: 1, entryTo: 5, exitOffset: 40 },
  { id: "E3-8_X40", label: "V\xE0o 3\u20138, tho\xE1t +40", entryFrom: 3, entryTo: 8, exitOffset: 40 },
  { id: "E1-5_X60", label: "V\xE0o 1\u20135, tho\xE1t +60", entryFrom: 1, entryTo: 5, exitOffset: 60 }
];
var PRIOR_WINDOW = SECTOR_WINDOWS[2];
var PATH_OFFSETS = Array.from({ length: 71 }, (_, i) => i - 10);
var toPoints = (h, closedThrough) => h.rrg.filter((r) => !closedThrough || r.week <= closedThrough).map((r) => ({ sectorKey: h.code, sectorLabel: h.name, rsRatio: r.ratio, rsMomentum: r.momentum, quadrant: r.quadrant, asOf: r.date }));
function quantile2(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function sessionsBetween(dates, from, to) {
  let n = 0;
  for (const d of dates) if (d > from && d <= to) n++;
  return n;
}
function actionFor(t, window, hasSignal) {
  if (t === null) return "NO_DATE";
  if (!hasSignal || !window) return "NO_SIGNAL";
  if (t < window.entryFrom) return "TOO_EARLY";
  if (t <= window.entryTo) return "IN_WINDOW";
  if (t < window.exitOffset) return "WINDOW_PASSED";
  return "POST_EX";
}
function confidenceOf(q, n) {
  if (q === null || n === null) return null;
  if (q < 0.05 && n >= 15) return "HIGH";
  if (q < 0.1 && n >= 8) return "MEDIUM";
  return "LOW";
}
function computeSectorTiming(input) {
  const { summaries, histories, bench, closedThrough, asOf } = input;
  const benchDates = bench.map((b) => b.date);
  const vnCloses = bench.map((b) => b.adjClose);
  const prep = /* @__PURE__ */ new Map();
  for (const s of summaries) {
    const h = histories.get(s.code);
    if (!h) continue;
    const points = toPoints(h, closedThrough);
    prep.set(s.code, { h, points, prices: h.index.map(([date, close]) => ({ date, adjClose: close })), transitions: detectQuadrantTransitions(points, TARGET_QUADRANT) });
  }
  const vnCal = input.cal ?? makeVnTradingCalendar(null);
  const calOf = (_prices) => vnCal;
  const refSamples = /* @__PURE__ */ new Map();
  for (const [code, p] of prep) {
    if (!p.transitions.length) {
      refSamples.set(code, []);
      continue;
    }
    const paths = computeCyclePaths({ ticker: code, stockPrices: p.prices, benchmarkPrices: bench, events: p.transitions.map((t) => ({ exDate: t.date })), offsets: [PRIOR_WINDOW.entryFrom, PRIOR_WINDOW.exitOffset], cal: calOf(p.prices), version: SECTOR_TIMING_VERSION, asOf });
    refSamples.set(code, buildEventSamplesFromPaths(paths.offsets, paths.eventPaths, PRIOR_WINDOW.entryFrom, PRIOR_WINDOW.exitOffset));
  }
  const groupKey = (s) => `${s.level}|${s.level === 2 ? input.l1Of.get(s.code) ?? "?" : input.l1Of.get(s.parent ?? "") ?? s.parent ?? "?"}`;
  const signals = [], details = /* @__PURE__ */ new Map(), scanInputs = [];
  for (const s of summaries) {
    const p = prep.get(s.code);
    if (!p) continue;
    const peers = summaries.filter((o) => o.code !== s.code && groupKey(o) === groupKey(s)).map((o) => refSamples.get(o.code) ?? []);
    const prior = computeIndustryGroupPrior(peers.some((x) => x.length) ? peers : summaries.filter((o) => o.code !== s.code && o.level === s.level).map((o) => refSamples.get(o.code) ?? []));
    const cal = calOf(p.prices);
    const stats = computeSectorCycleStats({ sectorKey: s.code, targetQuadrant: TARGET_QUADRANT, transitions: p.transitions, sectorPrices: p.prices, benchmarkPrices: bench, windowDefs: SECTOR_WINDOWS, cal, prior, version: SECTOR_TIMING_VERSION, asOf });
    const last = p.transitions.at(-1) ?? null;
    const paths = last ? computeCyclePaths({ ticker: s.code, stockPrices: p.prices, benchmarkPrices: bench, events: p.transitions.map((t2) => ({ exDate: t2.date })), offsets: PATH_OFFSETS, cal, currentExDate: last.date, version: SECTOR_TIMING_VERSION, asOf }) : null;
    const sel = stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected) ?? null;
    const t = last ? sessionsBetween(benchDates, last.date, asOf) : null;
    const action = actionFor(t, sel, Boolean(sel && stats.reactionProbability));
    let entryPlan = null, curve = null;
    if (sel && paths && t !== null) {
      const k = paths.offsets.indexOf(Math.min(t, 60));
      const cars = paths.eventPaths.map((e) => e.car[k]).filter((v) => v !== null && Number.isFinite(v));
      curve = k >= 0 && cars.length ? { offset: paths.offsets[k], n: cars.length, mean: cars.reduce((a, b) => a + b, 0) / cars.length, p5: quantile2(cars, 0.05), p25: quantile2(cars, 0.25), p75: quantile2(cars, 0.75), p95: quantile2(cars, 0.95) } : null;
      const cur = k >= 0 ? paths.currentPath?.[k] ?? void 0 : void 0;
      const ix = p.prices, iEntry = ix.findIndex((x) => x.date > last.date);
      const entryIdx = iEntry >= 0 ? Math.min(ix.length - 1, iEntry + sel.entryFrom - 1) : -1;
      const tr = [];
      for (let i = Math.max(1, ix.length - 15); i < ix.length; i++) tr.push(Math.abs(ix[i].adjClose - ix[i - 1].adjClose));
      entryPlan = buildEntryPlanSummary({
        entryFrom: sel.entryFrom,
        entryTo: sel.entryTo,
        exitOffset: sel.exitOffset,
        currentOffset: t,
        currentCarValue: cur ?? void 0,
        curvePointAtCurrentOffset: curve ?? void 0,
        entryPrice: entryIdx >= 0 && t >= sel.entryFrom ? ix[entryIdx].adjClose : void 0,
        atr: tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : void 0,
        currentPrice: ix.at(-1)?.adjClose
      });
    }
    const conf = input.confluenceBySector?.get(s.code) ?? null;
    const world = worldContextFor(s.code, input.worldSignals ?? null);
    const fused = fuseSectorSignals({
      world: world ? { usable: world.usable, probability: world.probability } : null,
      reactionProbability: stats.reactionProbability?.mean ?? null,
      reactionProbabilityNEvents: sel?.nEvents ?? 0,
      confluence: conf !== null ? { confluenceScore: conf } : null,
      macroRegime: input.macroRegime,
      vnIndexCloses: vnCloses
    });
    const pr = stats.reactionProbability?.mean ?? null;
    const decision = computeSectorDecisionState({
      action,
      combined: fused.combined,
      entryPlan: entryPlan ?? { tranches: [], runTooFar: { percentile: null, hasRunTooFar: false }, invalidationLevel: null, invalidated: false, timeStopped: false, pauseFurtherEntries: false },
      marketRegime: fused.marketRegime,
      transitionDateConfirmed: true,
      // chưa có xác suất lịch sử -> "không mâu thuẫn" khi Confluence kỹ thuật không tiêu cực (≥ 50); không có Confluence -> chưa biết
      confluenceCorroborates: conf === null ? null : pr === null ? conf >= 50 : conf >= 50 === pr >= 0.5,
      liquidityOk: s.thin ? false : null,
      world: world ? { usable: world.usable, probability: world.probability, reason: world.reason, tierA: world.tierA } : null
    });
    signals.push({
      sectorKey: s.code,
      action,
      tdSinceTransition: t,
      window: sel ? { entryFrom: sel.entryFrom, entryTo: sel.entryTo, exitOffset: sel.exitOffset } : null,
      expectedNetReturn: sel ? sel.netExpectancy : null,
      expectedNetReturnLcb: sel ? sel.netExpectancyLcb : null,
      nEvents: sel ? sel.nEvents : p.transitions.length,
      fdrQValue: sel ? sel.fdrQValue : null,
      confidence: sel ? confidenceOf(sel.fdrQValue, sel.nEvents) : null,
      reactionProbability: stats.reactionProbability ? { mean: stats.reactionProbability.mean, ci: stats.reactionProbability.ci } : null,
      name: s.name,
      level: s.level,
      group: groupKey(s).split("|")[1],
      quadrant: s.quadrant,
      liveQuadrant: s.liveQuadrant,
      indexMembers: s.indexMembers,
      thin: Boolean(s.thin),
      lastTransitionDate: last?.date ?? null,
      decision,
      confluenceScore: conf
    });
    details.set(s.code, { code: s.code, name: s.name, level: s.level, stats, paths: paths ? { offsets: paths.offsets, eventPaths: paths.eventPaths, currentPath: paths.currentPath } : { offsets: [], eventPaths: [], currentPath: null }, decision, entryPlan, curveAtCurrent: curve, rrg: p.h.rrg.slice(-26) });
    scanInputs.push({ sectorKey: s.code, stats });
  }
  return { signals, details, opportunities: scanSectorOpportunities(scanInputs, { minLowerBound: 0.5 }) };
}

// lib/scoring/weighted-macro-score.ts
var THRESHOLDS = {
  dxy: { safe: 102, danger: 105 },
  vix: { safe: 15, danger: 25 },
  treasury10y: { safe: 4, danger: 4.8 }
};
function normalizeInverse(value, safe, danger) {
  if (value <= safe) return 100;
  if (value >= danger) return 0;
  return Math.round((danger - value) / (danger - safe) * 100);
}
function calculateRiskOnIndex(inputs) {
  const dxyScore = normalizeInverse(inputs.dxy, THRESHOLDS.dxy.safe, THRESHOLDS.dxy.danger);
  const vixScore = normalizeInverse(inputs.vix, THRESHOLDS.vix.safe, THRESHOLDS.vix.danger);
  const treasuryScore = normalizeInverse(inputs.treasury10y, THRESHOLDS.treasury10y.safe, THRESHOLDS.treasury10y.danger);
  const score = Math.round(dxyScore * 0.4 + vixScore * 0.3 + treasuryScore * 0.3);
  let status = "NEUTRAL";
  let color = "amber";
  if (score >= 65) {
    status = "RISK_ON";
    color = "green";
  } else if (score <= 35) {
    status = "RISK_OFF";
    color = "red";
  }
  return { score, status, breakdown: { dxyScore, vixScore, treasuryScore }, color };
}

// stub:no-supabase
var no = () => {
  throw new Error("Supabase kh\xF4ng c\xF3 tr\xEAn Market Gateway");
};
var createServiceClient = no;

// lib/sector-filter/compute-top20.ts
var TICKER_SECTOR_MAP = {};
stockUniverse.forEach((s) => {
  TICKER_SECTOR_MAP[s.ticker] = s.sector;
});
async function fetchRiskOnScore() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from("world_macro_trends").select("dxy, vix, treasury_10y").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!data || data.dxy == null || data.vix == null || data.treasury_10y == null) {
      console.warn("[top20] Khong lay duoc du lieu vi mo moi nhat de tinh Risk-On Index - dung trong so trung lap (score=50).");
      return 50;
    }
    return calculateRiskOnIndex({ dxy: data.dxy, vix: data.vix, treasury10y: data.treasury_10y }).score;
  } catch (err) {
    console.error("[top20] Loi lay Risk-On Index, dung trong so trung lap (score=50):", err);
    return 50;
  }
}

// lib/locnganh/sector-io.ts
async function getJson2(path, timeoutMs = 2e4) {
  const res = await fetch(`${MARKET_GATEWAY_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Gateway ${path} HTTP ${res.status}`);
  return res.json();
}
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}
var RISK_ON_IN_DECISION = false;
var RISK_ON_EVIDENCE = {
  label: "HEURISTIC_FAILED",
  reason: "Risk-On \u0111\xE3 ki\u1EC3m \u0111\u1ECBnh \u0111\u1EB7t tr\u01B0\u1EDBc 10 n\u0103m (124 m\u1EABu): IC +0,05, KTC95 [\u22120,10; +0,22] \u2014 kh\xF4ng \u0111\u1EA1t. Ch\u1EC9 hi\u1EC3n th\u1ECB, kh\xF4ng d\xF9ng trong quy\u1EBFt \u0111\u1ECBnh."
};
var macroRegimeOf = (score) => score === null ? "TRUNG_LAP" : score >= 65 ? "RISK_ON" : score <= 35 ? "RISK_OFF" : "TRUNG_LAP";
function groupConfluence(rows, symbols) {
  const acc = /* @__PURE__ */ new Map();
  for (const r of rows) {
    for (const code of [symbols[r.ticker]?.l2, symbols[r.ticker]?.l3]) {
      if (!code) continue;
      if (!acc.has(code)) acc.set(code, []);
      acc.get(code).push(r.confluenceScore);
    }
  }
  return new Map([...acc].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}
async function confluenceBySector(symbols) {
  try {
    const { prisma } = await Promise.resolve().then(() => __toESM(require_no_prisma()));
    const latest = await prisma.sectorTop20Entry.findFirst({ orderBy: { generatedAt: "desc" }, select: { generatedAt: true } });
    if (!latest) return /* @__PURE__ */ new Map();
    const rows = await prisma.sectorTop20Entry.findMany({ where: { generatedAt: latest.generatedAt }, select: { ticker: true, confluenceScore: true } });
    return groupConfluence(rows, symbols);
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
async function loadSectorTimingInput() {
  const [summary, taxonomy] = await Promise.all([
    getJson2("/api/market/sectors/rrg", 6e4),
    getJson2("/api/market/sectors/taxonomy").catch(() => ({ symbols: {} }))
  ]);
  const year = Number(summary.dataAsOf.slice(0, 4));
  const [histories, bench, riskOnScore, confluence, holidays, worldSignals] = await Promise.all([
    mapLimit(summary.sectors, 6, (s) => getJson2(`/api/market/sectors/${s.code}/history`).catch(() => null)),
    getJson2("/api/market/ohlcv?symbol=VNINDEX&range=5y", 3e4),
    fetchRiskOnScore().catch(() => null),
    confluenceBySector(taxonomy.symbols),
    fetchGatewayHolidays(MARKET_GATEWAY_URL, `${year - 6}-01-01`, `${year + 1}-12-31`),
    fetchWorldSectorSignals()
  ]);
  const l1Of = new Map(summary.sectors.filter((s) => s.level === 2).map((s) => [s.code, s.parent]));
  const benchPrices = bench.bars.filter((b) => !b.partial && b.close > 0).map((b) => ({ date: b.date, adjClose: b.close }));
  return {
    engine: summary.engine,
    gatewayAsOf: summary.dataAsOf,
    method: summary.method,
    coverage: summary.coverage,
    riskOnScore,
    evidence: summary.evidence ?? null,
    summaries: summary.sectors,
    histories: new Map(histories.filter((h) => !!h).map((h) => [h.code, h])),
    l1Of,
    bench: benchPrices,
    closedThrough: summary.closedThrough,
    asOf: benchPrices.at(-1)?.date ?? summary.dataAsOf,
    macroRegime: RISK_ON_IN_DECISION ? macroRegimeOf(riskOnScore) : "TRUNG_LAP",
    riskOnDisplayRegime: macroRegimeOf(riskOnScore),
    confluenceBySector: confluence,
    cal: makeVnTradingCalendar(holidays),
    worldSignals
  };
}

// lib/locnganh/sector-timing-service.ts
var TTL_MS3 = 30 * 6e4;
async function build() {
  const ctx = await loadSectorTimingInput();
  const r = computeSectorTiming(ctx);
  return {
    version: SECTOR_TIMING_VERSION,
    asOf: ctx.asOf,
    gateway: { engine: ctx.engine, dataAsOf: ctx.gatewayAsOf, closedThrough: ctx.closedThrough, method: ctx.method, coverage: ctx.coverage },
    // macroRegime = chế độ ĐÃ dùng trong quyết định (TRUNG_LAP khi Risk-On bị loại); riskOnRegime = nhãn hiển thị của điểm Risk-On
    market: { riskOnScore: ctx.riskOnScore, macroRegime: ctx.macroRegime, riskOnRegime: ctx.riskOnDisplayRegime, riskOnInDecision: RISK_ON_IN_DECISION, riskOnEvidence: RISK_ON_EVIDENCE },
    windows: SECTOR_WINDOWS,
    // L3 (Gateway sectors/validation.js): kiểm định đặt trước "ngành vào Cải thiện" — KHÔNG ĐẠT -> EXPERIMENTAL
    evidence: ctx.evidence ?? { label: "EXPERIMENTAL", reason: "Ch\u01B0a c\xF3 k\u1EBFt qu\u1EA3 ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu \u2014 tham kh\u1EA3o, kh\xF4ng ph\u1EA3i khuy\u1EBFn ngh\u1ECB." },
    signals: r.signals,
    opportunities: r.opportunities,
    details: r.details,
    // cho cron theo dõi tín hiệu (không trả qua API)
    bench: ctx.bench,
    indexPrices: new Map([...ctx.histories].map(([code, h]) => [code, h.index.map(([date, close]) => ({ date, adjClose: close }))])),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var cache2 = null;
var inflight = null;
async function getSectorTiming(force = false) {
  if (!force && cache2 && Date.now() - cache2.at < TTL_MS3) return cache2.value;
  inflight ??= build().then((value) => {
    cache2 = { at: Date.now(), value };
    return value;
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

// lib/locnganh/tracking.ts
var REISSUE_GAP_DAYS2 = 120;
function sessionAfter(dates, from, n) {
  const k = dates.findIndex((d2) => d2 > from);
  if (k >= 0 && k + n - 1 < dates.length) return dates[k + n - 1];
  let d = /* @__PURE__ */ new Date(`${k >= 0 ? dates.at(-1) : from}T00:00:00Z`), left = k >= 0 ? n - (dates.length - k) : n;
  while (left > 0) {
    d = new Date(d.getTime() + 864e5);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}
function planSectorIssue(sig, windowId, existing, benchDates, asOf, nowIso) {
  if (sig.action !== "IN_WINDOW" || !sig.window || !windowId || !sig.lastTransitionDate) return null;
  if (sig.decision.level === "AVOID") return null;
  const cutoff = new Date(Date.parse(asOf) - REISSUE_GAP_DAYS2 * 864e5).toISOString();
  if (existing.some((r) => r.sectorCode === sig.sectorKey && r.windowId === windowId && (r.outcome === null || r.issuedAt >= cutoff))) return null;
  return {
    id: `${sig.sectorKey}:${windowId}:${asOf}`,
    sectorCode: sig.sectorKey,
    windowId,
    level: sig.decision.level,
    predictedProbability: sig.decision.combinedProbability,
    components: [],
    transitionDate: sig.lastTransitionDate,
    entryDate: asOf,
    plannedExitDate: sessionAfter(benchDates, sig.lastTransitionDate, sig.window.exitOffset),
    issuedAt: nowIso,
    outcome: null,
    realizedCar: null,
    exitDate: null,
    outcomeRecordedAt: null
  };
}
function planSectorResolutions(open, indexOf, bench) {
  const bm = new Map(bench.map((p) => [p.date, p.adjClose])), lastB = bench.at(-1)?.date;
  const out = [];
  for (const r of open) {
    if (r.outcome !== null || !lastB || lastB < r.plannedExitDate) continue;
    const ix = indexOf(r.sectorCode);
    if (!ix?.length) continue;
    const sm = new Map(ix.map((p) => [p.date, p.adjClose]));
    const exitDate = bench.find((p) => p.date >= r.plannedExitDate)?.date;
    if (!exitDate) continue;
    const s0 = sm.get(r.entryDate), s1 = sm.get(exitDate), b0 = bm.get(r.entryDate), b1 = bm.get(exitDate);
    if (!(s0 && s1 && b0 && b1)) continue;
    const car = Math.log(s1 / s0) - Math.log(b1 / b0);
    out.push({ id: r.id, outcome: car > 0 ? 1 : 0, realizedCar: car, exitDate });
  }
  return out;
}

// lib/jobs/sector-timing-scan.ts
async function runSectorTimingScan() {
  try {
    const t = await getSectorTiming(true);
    const rows = (await storeList("sectortrack")).map((r) => toTrack(r));
    const now = (/* @__PURE__ */ new Date()).toISOString(), benchDates = t.bench.map((b) => b.date);
    let issued = 0;
    for (const sig of t.signals) {
      const row = planSectorIssue(sig, t.details.get(sig.sectorKey)?.stats.selectedWindowId ?? null, rows, benchDates, t.asOf, now);
      if (!row) continue;
      await storeUpsert("sectortrack", [{ ...row, outcomeRecordedAt: null }]);
      rows.push(row);
      issued++;
    }
    const resolutions = planSectorResolutions(rows.filter((r) => r.outcome === null), (c) => t.indexPrices.get(c), t.bench);
    if (resolutions.length) {
      const at = (/* @__PURE__ */ new Date()).toISOString();
      await storeUpsert("sectortrack", resolutions.map((r) => ({ id: r.id, outcome: r.outcome, realizedCar: r.realizedCar, exitDate: r.exitDate, outcomeRecordedAt: at })));
    }
    return jobOk({
      ok: true,
      asOf: t.asOf,
      sectors: t.signals.length,
      issued,
      resolved: resolutions.length,
      total: rows.length,
      actions: t.signals.reduce((m, s) => ({ ...m, [s.action]: (m[s.action] ?? 0) + 1 }), {})
    });
  } catch (err) {
    console.error("[cron/sector-timing-scan]", err);
    return jobFail({ error: String(err) });
  }
}
export {
  runEarningsSeasonalityScan,
  runSectorTimingScan,
  runTimingSignalsScan
};
