import EliteCommandRadar from './EliteCommandRadar';
import ActionCenter from './ActionCenter';
import NewsFeed from './NewsFeed';

export default function InsightPanel() {
  return (
    <div className="insight">
      <EliteCommandRadar />
      <ActionCenter />
      <NewsFeed />
      <div className="disclaimer">
        Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư. Dữ liệu cập nhật theo thời gian thực, có thể trễ.
      </div>
    </div>
  );
}
