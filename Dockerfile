# ---------- Stage 1: build Expo web (static) ----------
FROM node:22-alpine AS build
WORKDIR /app

ENV EXPO_NO_TELEMETRY=1 \
    CI=1

# URL backend nhúng vào bundle lúc build (để trống -> https://server.hrmss.cyou/api/v1)
ARG EXPO_PUBLIC_API_URL=""
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx expo export --platform web --output-dir dist

# ---------- Stage 2: serve static bằng nginx ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

