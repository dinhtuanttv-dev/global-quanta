import { useEffect, useState } from 'react';
import * as api from '../../services/api';
import type { NewsItem as NewsItemType } from '../../types';

function NewsItem({ item }: { item: NewsItemType }) {
  return (
    <div className="news-item">
      <div className="news-tag">{item.ticker}</div>
      <div className="news-body">
        <div className="news-title">{item.title}</div>
        <div className="news-meta">
          <span className={item.relevance === 'core' ? 'core-relevance' : ''} style={item.relevance === 'ring' ? { color: '#5B8CD6', fontWeight: 600 } : undefined}>
            ● {item.relevance === 'core' ? 'Core' : 'Ring'}
          </span>
          <span>{item.timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

export default function NewsFeed() {
  const [items, setItems] = useState<NewsItemType[]>([]);

  useEffect(() => { api.fetchNewsFeed().then(setItems); }, []);

  // Core trước, Ring sau — đúng nguyên tắc ưu tiên đã thống nhất
  const sorted = [...items].sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'core' ? -1 : 1));

  return (
    <div className="panel-block news-block">
      <div className="panel-head"><div className="panel-title">TIN TỨC THÔNG MINH <span className="ai-chip">AI</span></div></div>
      {sorted.length === 0 && <div className="ac-hold">Chưa có tin liên quan đến Core/Ring hôm nay.</div>}
      {sorted.map((item) => <NewsItem key={item.id} item={item} />)}
    </div>
  );
}
