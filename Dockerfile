FROM node:alpine as build

RUN npm install -g pnpm webpack webpack-cli

WORKDIR app
COPY package.json pnpm-lock.yaml ./
RUN pnpm i
COPY . .
RUN webpack

FROM nikolaik/python-nodejs

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick && \
    # Clean up the package lists to keep the image size down
    rm -rf /var/lib/apt/lists/* \
RUN apt install chromium -y
RUN pip install rembg[cli]
RUN rembg d

WORKDIR app

COPY --from=build /app/dist /app/dist
ENTRYPOINT ["node", "dist/app.js"]
