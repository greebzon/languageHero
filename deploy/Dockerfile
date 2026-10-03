# LingvoHero API + admin panel (and the generation worker from the same image).
FROM node:24-slim
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app
COPY . .
# Only what the server needs: the API with its workspace packages and the panel to build.
RUN pnpm install --frozen-lockfile --filter "@lingvohero/api..." --filter "@lingvohero/admin..." \
  && pnpm --filter @lingvohero/admin build \
  && chown -R node:node /app/content
ENV NODE_ENV=production
USER node
EXPOSE 3001
# Started directly (no package manager at run time): the API; the worker overrides the command.
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/api/src/index.ts"]
