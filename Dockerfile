# syntax=docker/dockerfile:1.7

FROM node:20-slim AS build
WORKDIR /app

COPY ai-universe-app/package.json ai-universe-app/package-lock.json ./ai-universe-app/
COPY ai-universe-app/tsconfig.json ./ai-universe-app/
WORKDIR /app/ai-universe-app
RUN npm ci

COPY ai-universe-app ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/ai-universe-app/package.json ./package.json
COPY --from=build /app/ai-universe-app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev

COPY --from=build /app/ai-universe-app/dist ./dist
COPY --from=build /app/ai-universe-app/widgets ./widgets

EXPOSE 8080
CMD ["node", "dist/server.js"]
