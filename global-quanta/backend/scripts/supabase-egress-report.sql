-- Báo cáo băng thông Supabase theo truy vấn — phương án KHÔNG cần token: dán vào Supabase Dashboard → SQL Editor → Run.
-- CHỈ ĐỌC (SELECT). Cùng nội dung với scripts/supabase-egress-report.mjs.

-- 1) pg_stat_statements đã bật chưa + thống kê tính từ lúc nào
select extname, extversion from pg_extension where extname = 'pg_stat_statements';
select stats_reset from pg_stat_statements_info;

-- 2) Truy vấn trả về nhiều dòng nhất (nguồn egress chính)
select left(regexp_replace(query, '\s+', ' ', 'g'), 300) as query,
       calls, rows, round((rows::numeric / greatest(calls, 1)), 1) as rows_per_call,
       round(total_exec_time) as total_ms
from pg_stat_statements
where query !~* 'pg_stat_statements|pg_catalog|information_schema'
order by rows desc
limit 40;

-- 3) Bảng lớn nhất
select relname, n_live_tup as rows, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 30;

-- 4) Tài liệu KV lớn nhất (Gateway)
select key, pg_size_pretty(octet_length(value::text)::bigint) as size, updated_at
from market_kv order by octet_length(value::text) desc limit 25;

-- 5) Cột JSON lớn (Cổ tức)
select 'CotucDecisionState.snapshot' as col, count(*) as n, pg_size_pretty(avg(pg_column_size(snapshot))::bigint) as avg_per_row from "CotucDecisionState"
union all select 'EarningsSeasonalityCache.samples', count(*), pg_size_pretty(avg(pg_column_size(samples))::bigint) from "EarningsSeasonalityCache"
union all select 'EarningsSeasonalityCache.paths', count(*), pg_size_pretty(avg(pg_column_size(paths))::bigint) from "EarningsSeasonalityCache"
union all select 'EarningsSeasonalityCache.stats', count(*), pg_size_pretty(avg(pg_column_size(stats))::bigint) from "EarningsSeasonalityCache";
