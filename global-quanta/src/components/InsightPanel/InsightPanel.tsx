import EliteCommandRadar from './EliteCommandRadar';
import ActionCenter from './ActionCenter';
import NewsFeed from './NewsFeed';

/** Cột phải — QUANTA UI v2 (U2): lớp .q-ui, tiêu đề theo chuẩn nút tab, một màu nhấn xanh; vàng chỉ cho cảnh báo. */
export default function InsightPanel() {
  return (
    <div className="insight tw-scope q-ui">
      <div className="flex flex-col gap-3 p-3">
        <EliteCommandRadar />
        <ActionCenter />
        <NewsFeed />
        <p className="text-[11px] text-q-text-3 px-1 pb-2">
          Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư. Dữ liệu cập nhật theo thời gian thực, có thể trễ.
        </p>
      </div>
    </div>
  );
}
