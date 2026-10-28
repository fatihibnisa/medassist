FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
