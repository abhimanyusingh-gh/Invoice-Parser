FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package.json
COPY yarn.lock yarn.lock
COPY .yarnrc.yml .yarnrc.yml
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN corepack enable && yarn install

COPY backend backend
WORKDIR /app/backend

RUN yarn run build

CMD ["node", "dist/server.js"]
