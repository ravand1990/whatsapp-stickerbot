FROM nikolaik/python-nodejs:python3.9-nodejs23-slim
RUN ln -sf /bin/bash /bin/sh

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick chromium pngquant && \
    rm -rf /var/lib/apt/lists/*

RUN pip install rembg[cli]
RUN rembg d

RUN npm install -g pnpm webpack webpack-cli

WORKDIR app
COPY package.json pnpm-lock.yaml ./
RUN pnpm i
COPY . .
RUN webpack
ENV OMP_NUM_THREADS=2
ENTRYPOINT ["node", "dist/app.js"]