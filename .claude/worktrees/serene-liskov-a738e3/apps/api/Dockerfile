FROM node:20-slim

WORKDIR /app

# Copiar manifests para layer de cache do npm install
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Instalar todas as dependencias (npm install é tolerante a lock file desatualizado)
RUN npm install

# Instalar peer deps opcionais que nao vem automaticamente
RUN npm install semver luxon uuid --no-save

# Copiar codigo-fonte
COPY packages/ packages/
COPY apps/api/ apps/api/

# Bundle com esbuild: resolve path aliases, bundla tudo em um unico JS
# --bundle: inlina todas as dependencias no output
# --platform=node: target Node.js (CommonJS, sem browser APIs)
# --external: preserva modulos nativos que nao podem ser bundlados
RUN node_modules/.bin/esbuild apps/api/src/index.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --outfile=apps/api/dist/server.js \
    --external:ioredis \
    --external:@neondatabase/serverless \
    --external:bcryptjs \
    --external:node-cron \
    --external:semver \
    --external:luxon \
    --external:uuid \
    --log-level=info

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
