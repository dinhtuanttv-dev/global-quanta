/**
 * CF0 — nhãn bằng chứng của Cycle Fingerprint. Số liệu từ kiểm định walk-forward 2026-10-10 (bản sao đúng thuật toán
 * production findTopKCycles; 60 mã thanh khoản, giá điều chỉnh Gateway, 04/2023 → 08/2026, mỗi 10 phiên, ≈5.100 lần dự báo;
 * placebo = 5 giai đoạn quá khứ chọn ngẫu nhiên cùng ràng buộc). Đây là kiểm định khám phá, chưa đặt quy tắc trước — bản đặt
 * trước là CF3. Khi engine mới (CF2) qua CF3, thay khối này bằng kết quả kiểm định thật.
 */
export const CF_EVIDENCE = {
  label: 'EXPERIMENTAL',
  testedAt: '2026-10-10',
  rows: [
    { window: 10, ic: -0.065, placebo: -0.033 },
    { window: 20, ic: -0.091, placebo: -0.015 },
    { window: 30, ic: -0.061, placebo: -0.027 },
    { window: 60, ic: -0.043, placebo: -0.015 },
  ],
  brier: { model: 0.306, coin: 0.25 },
  calibration: { pred0: 0.6, pred100: 0.47 },
  hit20: { predicted: 0.56, actual: 0.43 },
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const n3 = (x: number) => x.toFixed(3).replace('.', ',');

export function CfEvidenceBanner({ windowSize }: { windowSize: number }) {
  const row = CF_EVIDENCE.rows.find((r) => r.window === windowSize);
  return (
    <div className="cf-evidence" role="note" data-testid="cf-evidence">
      <p className="cf-evidence__head">
        <span className="cf-evidence__label">{CF_EVIDENCE.label}</span>
        <b>Chưa có năng lực dự báo — chỉ để quan sát, không phải khuyến nghị.</b>
      </p>
      <p>
        Kiểm định walk-forward {CF_EVIDENCE.testedAt} (60 mã, giá điều chỉnh, 04/2023 → 08/2026, ≈5.100 lần dự báo):
        tương quan hạng giữa lợi suất 30 phiên dự báo và thực tế <b>âm ở mọi cửa sổ</b>
        {row ? <> (cửa sổ {row.window}: {n3(row.ic)}, chọn ngẫu nhiên 5 giai đoạn quá khứ: {n3(row.placebo)})</> : null},
        tức là kém hơn chọn ngẫu nhiên.
        Tỷ lệ tăng bị đảo chiều: báo 0/5 giai đoạn tăng thì thực tế {pct(CF_EVIDENCE.calibration.pred0)} lần tăng, báo 5/5 thì {pct(CF_EVIDENCE.calibration.pred100)};
        Brier {n3(CF_EVIDENCE.brier.model)} (đoán mù {n3(CF_EVIDENCE.brier.coin)}).
        Xác suất chạm mục tiêu trong 20 phiên bị thổi phồng: báo {pct(CF_EVIDENCE.hit20.predicted)}, thực tế {pct(CF_EVIDENCE.hit20.actual)}.
      </p>
      <p className="cf-evidence__foot">
        Kiểm định khám phá, chưa đặt quy tắc trước. Engine mới và kiểm định đặt trước ngoài mẫu đang được xây dựng (CF1–CF3).
      </p>
    </div>
  );
}
