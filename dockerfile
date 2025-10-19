# 🧱 SV13 Duel Bot Backend — Production Dockerfile
# Base image: lightweight and secure Node.js 22 Alpine build
FROM node:22-alpine AS base

# Set working directory
WORKDIR /app

# Environment setup
ENV NODE_ENV=production
ENV TZ=America/New_York

# Railway automatically injects PORT at runtime
EXPOSE 3000

# ----------------------------
# 🧩 Dependency Installation
# ----------------------------
# Copy package manifests first for layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# ----------------------------
# 📦 Application Source
# ----------------------------
# Copy project files (after dependency caching)
COPY . .

# ----------------------------
# 🧠 Runtime Configuration
# ----------------------------
# Default command runs the backend API
CMD ["node", "server.js"]

# ----------------------------
# 🩺 Health Check (Optional)
# ----------------------------
# Railway respects health responses if implemented in /health route
# HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
#   CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# ----------------------------
# 🧾 Metadata
# ----------------------------
LABEL org.opencontainers.image.title="SV13 Duel Bot Backend"
LABEL org.opencontainers.image.description="Production-ready backend for the SV13 DayZ-Themed Collectible Card Game on Discord"
LABEL org.opencontainers.image.authors="SV13 Development Team"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="1.2.0"
