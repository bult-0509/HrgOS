FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY assets/opening-photo-set ./assets/opening-photo-set
COPY src/data/loginAccounts.ts ./src/data/loginAccounts.ts
COPY src/data/scoringRules.json ./src/data/scoringRules.json
COPY src/data/abilityCatalog.json ./src/data/abilityCatalog.json
ENV NODE_ENV=production PORT=4000
USER node
CMD ["node", "server/start.mjs"]
