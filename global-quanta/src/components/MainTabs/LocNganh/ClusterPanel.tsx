import type { ClusterInput } from '../../../types/cycleFingerprint';
import { useClusterAnalysis } from '../../../hooks/useClusterAnalysis';

/**
 * Panel Phan cum (HDBSCAN) - GOI RIENG endpoint Python /api/cluster, HOAN
 * TOAN DOC LAP voi luong du lieu chinh (analyze). Neu cham/loi, chi panel
 * nay bi anh huong - khong lam gian doan MainChart/TopKList/FanChart/
 * Timing/Explainability dang hien thi binh thuong.
 */
export function ClusterPanel({ clusterInput }: { clusterInput: ClusterInput | undefined }) {
  const { data, isLoading, isError, error } = useClusterAnalysis(clusterInput?.distanceMatrix);

  if (!clusterInput || clusterInput.candidates.length < 4) return null;

  if (isLoading) {
    return (
      <section className="cf-cluster-panel">
        <h4>Phân cụm chu kỳ (HDBSCAN)</h4>
        <p className="cf-cluster-status">Đang phân tích...</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="cf-cluster-panel">
        <h4>Phân cụm chu kỳ (HDBSCAN)</h4>
        <p className="cf-cluster-status" style={{ color: 'var(--negative)' }}>
          Không tải được kết quả phân cụm. {error?.message ?? ''}
        </p>
      </section>
    );
  }

  if (!data) return null;

  // Cum cua "hom nay" = cum cua ung vien GIONG NHAT (candidate #0, da sap
  // xep theo khoang cach voi cua so hien tai tu findTopKCycles) - cach don
  // gian, minh bach de tra loi "mau hinh hien tai thuoc nhom lich su nao"
  // ma khong can giu lai model HDBSCAN da fit (khong phu hop serverless
  // khong trang thai).
  const todayClusterLabel = data.labels[0];
  const todayProbability = data.probabilities[0];
  const isNoise = todayClusterLabel === -1;

  // Dem so thanh vien tung cum de hien thi phan bo
  const clusterCounts = new Map<number, number>();
  data.labels.forEach((l) => clusterCounts.set(l, (clusterCounts.get(l) ?? 0) + 1));
  const sortedClusters = Array.from(clusterCounts.entries())
    .filter(([label]) => label !== -1)
    .sort((a, b) => b[1] - a[1]);
  const noiseCount = clusterCounts.get(-1) ?? 0;

  return (
    <section className="cf-cluster-panel">
      <h4>Phân cụm chu kỳ (HDBSCAN)</h4>
      {isNoise ? (
        <p className="cf-cluster-status">
          Mẫu hình hiện tại <b>không thuộc nhóm nào rõ ràng</b> trong {clusterInput.candidates.length} chu kỳ đã quét — khá đặc thù, ít lặp lại trong lịch sử.
        </p>
      ) : (
        <p className="cf-cluster-status">
          Mẫu hình hiện tại thuộc <b>Cụm #{todayClusterLabel}</b> (độ tin cậy thuộc cụm: {Math.round(todayProbability * 100)}%)
        </p>
      )}

      {data.nClusters > 0 && (
        <div className="cf-cluster-distribution">
          <p className="cf-cluster-status" style={{ opacity: 0.7, fontSize: 11 }}>
            Phân bố {clusterInput.candidates.length} chu kỳ đã quét: {data.nClusters} cụm
            {noiseCount > 0 ? `, ${noiseCount} không thuộc cụm nào` : ''}
          </p>
          <div className="cf-mini-histogram">
            {sortedClusters.map(([label, count]) => (
              <div key={label} className="cf-histogram-bar-wrap" title={`Cụm #${label}: ${count} chu kỳ`}>
                <div
                  className="cf-histogram-bar"
                  style={{ height: `${(count / clusterInput.candidates.length) * 100}%` }}
                />
                <span className="cf-histogram-label">#{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
