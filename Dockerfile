FROM node:20-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
EXPOSE 11434
USER node
CMD ["node", "dist/server.js"]
