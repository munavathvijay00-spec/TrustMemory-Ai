# TrustMemory AI server + static frontend.
# Install scripts are skipped, so better-sqlite3 has no native binary and the server uses
# Node's built-in node:sqlite (server/sqlite-compat.js), which Node 22 ships.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server ./server
COPY TrustMemory-AI-modular ./TrustMemory-AI-modular

# The SQLite file (trustmemory.db) is written to the working directory; mount a volume on
# /app to keep it across container restarts, or set TRUSTMEMORY_DB to a mounted path.
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server/index.js"]
