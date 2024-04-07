FROM nikolaik/python-nodejs

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick && \
    # Clean up the package lists to keep the image size down
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm nodemon puppeteer

RUN pip install rembg[cli]

RUN apt update && apt install -y chromium

RUN rembg d
RUN apt install --assume-yes pngquant

RUN ln -sf /bin/bash /bin/sh

WORKDIR app
ADD .. .

RUN chmod -R 777 .

CMD "nodemon"

#ENTRYPOINT ["top","-b"]