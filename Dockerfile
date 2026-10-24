# Sublime: image for the VPS (Next.js standalone server), one per environment.
#
#   docker build --network host --secret id=dotenv,src=/srv/sublime/staging.env -t sublime:staging .
#
# Parts of the pages are prerendered at build time and decide there whether
# accounts, the database and uploads are on, so the build needs the same
# environment as the running container (and the database reachable). The env
# file is mounted as a build secret: it is read during `next build` and never
# stored in any image layer. At runtime the container gets it again (env_file).

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=dotenv,target=/app/.env.production,required=true npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MEDIA_ROOT=/data/media
# Unprivileged user; the media volume must be writable by it (uid 1001).
RUN groupadd --system --gid 1001 sublime && useradd --system --uid 1001 --gid sublime sublime \
    && mkdir -p /data/media && chown -R sublime:sublime /data
COPY --from=build --chown=sublime:sublime /app/.next/standalone ./
COPY --from=build --chown=sublime:sublime /app/.next/static ./.next/static
COPY --from=build --chown=sublime:sublime /app/public ./public
# Migrations travel with the image so each deploy can apply them before starting
# (the standalone output already includes the pg driver they need).
COPY --from=build --chown=sublime:sublime /app/db ./db
COPY --from=build --chown=sublime:sublime /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs
USER sublime
EXPOSE 3000
VOLUME ["/data/media"]
CMD ["node", "server.js"]
