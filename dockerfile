# Duel-Bot backend
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
# Railway injects PORT at runtime; your server already honors process.env.PORT

# Install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev || npm i --omit=dev

# Copy source
COPY . .

# Optional: show listening port
EXPOSE 3000

CMD ["node", "server.js"]
