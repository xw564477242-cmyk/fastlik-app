FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_FASTLINK_API_URL=/api
ARG VITE_FASTLINK_ENVIRONMENT=SANDBOX
ARG VITE_FASTLINK_INTERACTION_MODE=FULL
ARG VITE_FASTLINK_DATA_SOURCE=backend
ARG VITE_PUBLIC_BASE=/
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV VITE_FASTLINK_API_URL=$VITE_FASTLINK_API_URL
ENV VITE_FASTLINK_ENVIRONMENT=$VITE_FASTLINK_ENVIRONMENT
ENV VITE_FASTLINK_INTERACTION_MODE=$VITE_FASTLINK_INTERACTION_MODE
ENV VITE_FASTLINK_DATA_SOURCE=$VITE_FASTLINK_DATA_SOURCE
ENV VITE_PUBLIC_BASE=$VITE_PUBLIC_BASE
ENV VITE_FASTLINK_BUILD_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY runtime-config.template.js /tmp/runtime-config.template.js
COPY docker-entrypoint.sh /docker-entrypoint.d/40-fastlink-runtime.sh
RUN chmod +x /docker-entrypoint.d/40-fastlink-runtime.sh
EXPOSE 8080
