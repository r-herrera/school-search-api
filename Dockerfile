# ============================================
# Stage 1: Build (compile TypeScript)
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm config set strict-ssl false
RUN npm ci

COPY . .
RUN npm run build

# ============================================
# Stage 2: Production (minimal image)
# ============================================
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm config set strict-ssl false
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/build ./build

EXPOSE 3333

CMD ["node", "build/bin/server.js"]
