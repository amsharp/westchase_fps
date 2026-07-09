# Westchase FPS dedicated server: WebSocket relay + bug-report store + the
# headless-Chromium WORLD BOT that hosts the shared town (see server/server.js).
# The playwright base image ships Chromium + all system deps.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app
COPY . .
RUN cd server && npm install --omit=dev

# the world sim runs on this server (headless bot joins room MAIN as host)
ENV BOT_ENABLE=1

CMD ["node", "server/server.js"]
