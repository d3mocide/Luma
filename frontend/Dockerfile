# Build context: repo root

# Stage 1: build the React/Vite app
FROM node:22-alpine AS builder

RUN npm install -g pnpm@11

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .
RUN pnpm build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY --from=builder /app/dist /var/www/html
COPY nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
