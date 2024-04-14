FROM nikolaik/python-nodejs
RUN ln -sf /bin/bash /bin/sh

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick chromium && \
    rm -rf /var/lib/apt/lists/*

RUN pip install rembg[cli]
RUN rembg d

RUN npm install -g pnpm webpack webpack-cli

WORKDIR app
COPY package.json pnpm-lock.yaml ./
RUN pnpm i
COPY . .
RUN webpack

ENTRYPOINT ["node", "dist/app.js"]