# Market Gateway + Ingestor: cần chạy liên tục (giữ kết nối SSI stream),
# không chạy được trên Vercel serverless. Dùng được cho Railway, Fly.io, VPS.
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# Không tải trình duyệt Playwright (chỉ dùng cho AI Chart Vision capture).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
