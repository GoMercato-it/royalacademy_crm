# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps

ARG WWEBJS_API_REF=31e94123016757adcaa1a8aeca514695ee1f722d
ARG WHATSAPP_WEB_JS_REF=b0a4b6c6c10868fad4881fb484b97895ce898b5d

ENV CHROME_BIN="/usr/bin/chromium" \
    PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    NODE_ENV="production"

WORKDIR /usr/src/app

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/avoylenko/wwebjs-api.git . && \
    git checkout --detach "${WWEBJS_API_REF}" && \
    rm -rf .git

RUN npm ci --omit=dev --ignore-scripts && \
    npm install --omit=dev --save-exact "https://github.com/wwebjs/whatsapp-web.js/archive/${WHATSAPP_WEB_JS_REF}.tar.gz"

COPY patch-whatsapp-api-compat.js /tmp/patch-whatsapp-api-compat.js
RUN node /tmp/patch-whatsapp-api-compat.js

FROM node:22-bookworm-slim

ENV CHROME_BIN="/usr/bin/chromium" \
    PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    NODE_ENV="production"

WORKDIR /usr/src/app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      fonts-freefont-ttf \
      chromium \
      ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=deps /usr/src/app /usr/src/app

EXPOSE 3000

CMD ["npm", "start"]
