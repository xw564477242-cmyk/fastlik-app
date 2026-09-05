FROM node:20-alpine AS build

WORKDIR /app

ARG FASTLINK_BUILD_SHA

RUN apk add --no-cache bash

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN FASTLINK_BUILD_SHA="$FASTLINK_BUILD_SHA" npm run build:cloudflare:production

FROM nginx:1.27-alpine

LABEL org.opencontainers.image.source="https://github.com/xw564477242-cmyk/fastlik-app"
LABEL org.opencontainers.image.description="FastLink Wallet App"
LABEL org.opencontainers.image.licenses="UNLICENSED"

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

