// Worker thử cho workerProxy (test resourceDiet): giữ dữ liệu nạp bằng setReal, trả lại bằng get, kèm mã lần khởi động.
// `node --test` quét mọi tệp trong test/ -> khi không chạy trong worker thread (parentPort = null) thì không làm gì.
import { parentPort } from "node:worker_threads";
import { serveWorkerOps } from "../../src/market/macro/workerProxy.js";

if (parentPort) {
  let data = null;
  const bootId = Math.random();
  serveWorkerOps({
    setReal: ([list]) => { data = list; return data.length; },
    get: () => ({ data, bootId }),
  });
}
