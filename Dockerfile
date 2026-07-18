FROM node:20-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 11434
USER node
CMD ["node", "dist/server.js"]
