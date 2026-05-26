# Build context: repo root
# Stage 1: build the React/Vite app
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY web/ .
RUN pnpm build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /var/www/html
COPY nginx/conf.d/luma.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
