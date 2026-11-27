# Campus Kabar — single-service image.
#
# This image contains both halves of the product: the built React bundle and
# the Express API that serves it. They share one origin, which is what lets the
# browser use relative /api requests and a same-site refresh cookie.
#
# Uploaded media is NOT in this image. It lives on a persistent volume mounted
# at MEDIA_STORAGE_PATH, so a redeploy never disturbs it.

# --- Stage 1: build the single-page app -----------------------------------
FROM node:22-bookworm-slim AS frontend

WORKDIR /app/frontend

# Vite inlines public configuration at build time, so the canonical site URL
# has to be known here, not at runtime.
ARG VITE_PUBLIC_SITE_URL
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# --- Stage 2: production dependencies for the API --------------------------
FROM node:22-bookworm-slim AS backend-deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
# bcrypt ships prebuilt binaries for glibc platforms, so no compiler toolchain
# is needed here. --omit=dev keeps nodemon and supertest out of the image.
RUN npm ci --omit=dev && npm cache clean --force


# --- Stage 3: runtime ------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
# Default mount point for the Railway volume; override to relocate storage.
ENV MEDIA_STORAGE_PATH=/data
ENV FRONTEND_DIST_PATH=/app/frontend/dist

WORKDIR /app/backend

COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# The volume's mount point must exist and be writable before the process
# starts; the API refuses to boot otherwise. The container runs as root because
# a provider-managed volume is mounted root-owned, and the process needs to
# write to it.
RUN mkdir -p "$MEDIA_STORAGE_PATH"

EXPOSE 4000

# Applying migrations at start keeps the schema in step with the image. The
# service runs as a single replica (a volume cannot be shared between
# replicas), so there is no second process racing the same migration.
CMD ["sh", "-c", "npm run migrate && exec npm start"]
