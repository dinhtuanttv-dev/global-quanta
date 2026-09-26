/**
 * concurrency-limiter.ts - GIOI HAN so luong FETCH dong thoi toi cac
 * route TINH TOAN NANG (cycle-paths, cycle-stats-v3), dung CHUNG cho
 * TOAN BO cac dong cua bang Screener.
 *
 * BOI CANH (xac nhan qua log loi thuc te): sau khi them sparkline vao
 * bang Screener (Giai doan 1), MOI DONG BANG tu goi useCyclePaths(ticker)
 * RIENG - voi N ma dang hien (17-57 ma), co the tao ra N request DONG
 * THOI toi server, vuot qua gioi han ket noi dong thoi cua Neon
 * Postgres (du da fix Prisma khong tai tao ket noi moi lien tuc o
 * Giai doan truoc) -> 504 hang loat.
 *
 * GIAI PHAP (da xac nhan voi nguoi dung: GIU sparkline THAT, gioi han
 * so luong request DONG THOI thay vi bo di duong CAR that): 1
 * "semaphore" don gian - toi da MAX_CONCURRENT request duoc chay CUNG
 * LUC, cac request con lai XEP HANG CHO DEN KHI CO CHO TRONG.
 */

const MAX_CONCURRENT = 6;
let active = 0;
const queue: Array<() => void> = [];

function next() {
  if (active >= MAX_CONCURRENT) return;
  const resolve = queue.shift();
  if (!resolve) return;
  active++;
  resolve();
}

/** Xin 1 "cho" truoc khi goi fetch that - tra ve Promise cho phep tiep
 * tuc khi den luot. PHAI goi release() sau khi xong (thanh cong hay
 * loi deu phai goi, dung try/finally). */
function acquire(): Promise<void> {
  return new Promise((resolve) => {
    queue.push(resolve);
    next();
  });
}

function release() {
  active = Math.max(0, active - 1);
  next();
}

/** Boc 1 ham fetch bat ky (khong doi chu ky/kieu tra ve cua no) trong
 * gioi han dong thoi - dung cho fetchCyclePaths/fetchCycleStats o
 * cac hook, KHONG sua doi logic ben trong cac ham do. */
export async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
