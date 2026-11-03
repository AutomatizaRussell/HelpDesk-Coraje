# Etiqueta exacta, no `node:24-alpine`: Coolify construye con `--pull`, y una
# etiqueta flotante cambia de digest cada vez que Docker reconstruye la imagen,
# lo que invalida toda la caché de capas y obliga a reinstalar desde cero. La
# versión coincide con `.node-version`, la que usan las pruebas locales.
ARG NODE_IMAGE=node:24.22.2-alpine3.24

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm se descarga una sola vez, aquí, desde el `packageManager` de
# package.json (con su hash). Antes lo descargaba cada etapa al primer uso.
COPY package.json ./
RUN corepack enable && corepack install

# Store de pnpm en una caché de BuildKit, compartida entre etapas y entre
# despliegues: si el lockfile no cambió, la capa sale de caché; si cambió,
# solo se descargan los paquetes nuevos. La caché no entra en ninguna imagen.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=helpdesk-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# Imagen del servicio `migrate`: solo el CLI de Prisma, instalado desde su
# propio lockfile (`migrator/`, ver migrator.contract.test.mts), más
# prisma.config.ts y prisma/. Copiar el `node_modules` de la app la hacía de
# ~700 MB para correr un único comando.
FROM base AS migrator
COPY migrator/package.json migrator/pnpm-lock.yaml migrator/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=helpdesk-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# Hereda de `deps` en vez de copiar su `node_modules`: la copia de decenas de
# miles de archivos costaba un minuto en cada despliegue.
FROM deps AS builder

# DATABASE_URL dummy solo para permitir que Next importe módulos server durante build.
# No se usa en runtime y no contiene secretos reales.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN pnpm prisma generate
RUN pnpm build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
