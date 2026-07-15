FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY site/package.json site/package.json
COPY admin/package.json admin/package.json
COPY infra/package.json infra/package.json
COPY lambdas/posts/package.json lambdas/posts/package.json
COPY lambdas/views/package.json lambdas/views/package.json
COPY lambdas/uploads/package.json lambdas/uploads/package.json
COPY lambdas/metrics/package.json lambdas/metrics/package.json
COPY lambdas/publish-scheduler/package.json lambdas/publish-scheduler/package.json
RUN npm ci

COPY . .
RUN npm run build:shared

ENV AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=us-east-1
