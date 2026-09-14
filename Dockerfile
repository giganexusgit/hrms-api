# ---------- Builder ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /usr/src/app

# Native dependencies required to build canvas
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install && npm cache clean --force && rm -rf /root/.npm

COPY . .

RUN npm run build


# ---------- Production ----------
FROM node:20-bookworm-slim

WORKDIR /usr/src/app

# Runtime libraries required by canvas
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package*.json ./

RUN npm install --omit=dev && npm cache clean --force && rm -rf /root/.npm

COPY --from=builder /usr/src/app/dist ./dist

# Copy uploads if they exist
COPY uploads ./uploads

# Create writable directories
RUN mkdir -p \
    /usr/src/app/uploads/profiles \
    /usr/src/app/uploads/documents \
    /usr/src/app/uploads/organization/documents \
    /usr/src/app/logs \
    && chown -R node:node /usr/src/app/uploads \
    && chown -R node:node /usr/src/app/logs

USER node

EXPOSE 6543

CMD ["node", "dist/main.js"]