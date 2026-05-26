# Build context: repo root
# Stage 1: build the React/Vite app
FROM node:22-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .
RUN pnpm build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /var/www/html
COPY nginx/conf.d/luma.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
