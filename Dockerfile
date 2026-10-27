# Copilote projet — one image for the web app and the indexer.
#   docker compose up -d            (see docker-compose.yml and docs/copilote.md)
#
# Build arg EMBEDDINGS=local adds on-machine dense retrieval (multilingual-e5-small, ~120 MB,
# downloaded at build time so the running container needs no internet besides the Claude API).

FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG EMBEDDINGS=off
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
RUN if [ "$EMBEDDINGS" = "local" ]; then npm install --no-save --no-audit --no-fund @huggingface/transformers@3.7.1; fi
COPY . .
RUN npx next build

# Bake the embedding model into the image when enabled.
ENV COPILOTE_MODELS_DIR=/app/models
RUN if [ "$EMBEDDINGS" = "local" ]; then \
      node -e "import('@huggingface/transformers').then(async t => { t.env.cacheDir='/app/models'; await t.pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' }); })"; \
    else mkdir -p /app/models; fi

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    COPILOTE_DB=/data/copilote.sqlite \
    COPILOTE_MODELS_DIR=/app/models \
    COPILOTE_OFFLINE=1
# The whole app (not only .next/standalone) so the same image runs the indexer CLI (tsx).
COPY --from=build /app /app
RUN cp -r public .next/standalone/ && mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/ \
 && mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/copilote',{headers:{authorization:'Basic '+Buffer.from((process.env.COPILOTE_USER||'phenix')+':'+(process.env.COPILOTE_PASSWORD||'')).toString('base64')}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".next/standalone/server.js"]
