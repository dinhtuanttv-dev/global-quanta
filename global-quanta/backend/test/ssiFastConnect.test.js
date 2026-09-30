import test from "node:test";
import assert from "node:assert/strict";

const serviceUrl = new URL("../src/services/ssiFastConnect.js", import.meta.url);

function makeToken(exp = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withSSIConfig(t, apiBase, fetchMock) {
  const names = ["SSI_CONSUMER_ID", "SSI_CONSUMER_SECRET", "SSI_DATA_API_BASE"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    globalThis.fetch = originalFetch;
  });
  process.env.SSI_CONSUMER_ID = "test-consumer";
  process.env.SSI_CONSUMER_SECRET = "test-secret";
  if (apiBase === undefined) delete process.env.SSI_DATA_API_BASE;
  else process.env.SSI_DATA_API_BASE = apiBase;
  globalThis.fetch = fetchMock;
  return import(`${serviceUrl.href}?test=${Math.random()}`);
}

test("mints token and calls FC Data using SSI lookupRequest query format", async (t) => {
  const token = makeToken();
  const requests = [];
  const service = await withSSIConfig(t, "https://fc-data.ssi.com.vn/api/v2/Market/", async (url, options) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) return jsonResponse(200, { data: { accessToken: token } });
    return jsonResponse(200, { data: [{ symbol: "FPT" }] });
  });

  const result = await service.getMarketData("Securities", { symbol: "FPT", pageSize: 10 });

  assert.deepEqual(result, { data: [{ symbol: "FPT" }] });
  assert.equal(requests[0].url, "https://fc-data.ssi.com.vn/api/v2/Market/AccessToken");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    consumerID: "test-consumer",
    consumerSecret: "test-secret",
  });
  const dataUrl = new URL(requests[1].url);
  assert.equal(dataUrl.pathname, "/api/v2/Market/Securities");
  assert.equal(dataUrl.searchParams.get("lookupRequest.symbol"), "FPT");
  assert.equal(dataUrl.searchParams.get("lookupRequest.pageSize"), "10");
  assert.equal(requests[1].options.headers.authorization, `Bearer ${token}`);
});

test("reissues an access token once after SSI rejects a cached token", async (t) => {
  const tokens = [makeToken(), makeToken()];
  const requests = [];
  const service = await withSSIConfig(t, "https://fc-data.ssi.com.vn/api/v2", async (url, options) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });
    if (requestUrl.endsWith("/AccessToken")) {
      const tokenIndex = requests.filter((request) => request.url.endsWith("/AccessToken")).length - 1;
      return jsonResponse(200, { data: { accessToken: tokens[tokenIndex] } });
    }
    const dataAttempts = requests.filter((request) => !request.url.endsWith("/AccessToken")).length;
    if (dataAttempts === 1) return jsonResponse(401, { message: "Unauthorized" });
    return jsonResponse(200, { data: [] });
  });

  await service.getMarketData("IndexList");

  assert.equal(requests.filter((request) => request.url.endsWith("/AccessToken")).length, 2);
  const dataRequests = requests.filter((request) => !request.url.endsWith("/AccessToken"));
  assert.equal(dataRequests.length, 2);
  assert.equal(dataRequests[0].options.headers.authorization, `Bearer ${tokens[0]}`);
  assert.equal(dataRequests[1].options.headers.authorization, `Bearer ${tokens[1]}`);
});

test("maps SSI application errors in HTTP 200 responses to a non-success proxy status", async (t) => {
  const token = makeToken();
  let calls = 0;
  const service = await withSSIConfig(t, undefined, async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(200, { data: { accessToken: token } });
    return jsonResponse(200, { status: "Failure", message: "Invalid request" });
  });

  await assert.rejects(service.getMarketData("Securities", { pageSize: 3 }), (error) => error.statusCode === 502);
});

test("returns a configuration error without making a network request when credentials are absent", async (t) => {
  const previous = {
    id: process.env.SSI_CONSUMER_ID,
    secret: process.env.SSI_CONSUMER_SECRET,
    base: process.env.SSI_DATA_API_BASE,
  };
  const originalFetch = globalThis.fetch;
  t.after(() => {
    if (previous.id === undefined) delete process.env.SSI_CONSUMER_ID;
    else process.env.SSI_CONSUMER_ID = previous.id;
    if (previous.secret === undefined) delete process.env.SSI_CONSUMER_SECRET;
    else process.env.SSI_CONSUMER_SECRET = previous.secret;
    if (previous.base === undefined) delete process.env.SSI_DATA_API_BASE;
    else process.env.SSI_DATA_API_BASE = previous.base;
    globalThis.fetch = originalFetch;
  });
  delete process.env.SSI_CONSUMER_ID;
  delete process.env.SSI_CONSUMER_SECRET;
  globalThis.fetch = async () => assert.fail("fetch should not run without credentials");
  const service = await import(`${serviceUrl.href}?missing=${Math.random()}`);

  await assert.rejects(service.getMarketAccessToken(), (error) => error.statusCode === 503);
});
