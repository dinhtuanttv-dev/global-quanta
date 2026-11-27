# Market Gateway + Ingestor: cần chạy liên tục (giữ kết nối SSI stream),
# không chạy được trên Vercel serverless. Dùng được cho Railway, Fly.io, VPS.
# Bản sao chính thức của Docker Hub trên ECR Public — Railway bị Docker Hub giới hạn lượt tải (429).
FROM public.ecr.aws/docker/library/node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# Không tải trình duyệt Playwright (chỉ dùng cho AI Chart Vision capture).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 4000
# 27/11/2026 (a1): bỏ HEALTHCHECK của Docker — mỗi 30 s khởi một tiến trình Node mới chỉ để gọi /health. Railway kiểm sức khoẻ
# bằng cấu hình riêng của dịch vụ (Healthcheck Path), không cần chỉ thị này.
# 27/11/2026 (b1): trần heap 640 MB (mặc định của Node trên máy chủ này ~1,58 GB) để V8 thu gom sớm hơn, giữ RSS thấp hơn. Đỉnh đo
# được dưới tải: 200–340 MB (sau sửa OOM 23/10) -> còn dư gần gấp đôi. Worker (vĩ mô, thế giới, chu kỳ, job QMS) có heap riêng.
CMD ["node", "--max-old-space-size=640", "src/server.js"]
