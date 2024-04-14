FROM node:alpine as build

RUN npm install -g pnpm webpack webpack-cli

WORKDIR app
COPY package.json pnpm-lock.yaml ./
RUN pnpm i
COPY . .
RUN webpack

FROM nikolaik/python-nodejs

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick chromium && \
    rm -rf /var/lib/apt/lists/*

RUN pip install rembg[cli]
RUN rembg d

WORKDIR app

COPY --from=build /app/dist /app/dist
ENTRYPOINT ["node", "dist/app.js"]
