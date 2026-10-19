FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY app ./app
COPY normalize-api.mjs format.mjs api-probe.mjs ./
ENV NODE_ENV=production
CMD ["node", "app/server.mjs"]
