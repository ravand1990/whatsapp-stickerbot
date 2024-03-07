import {
  Client,
  ClientOptions,
  LocalAuth,
  Message,
  MessageMedia,
  MessageSendOptions,
  MessageTypes,
} from "whatsapp-web.js";
import * as qrcode from "qrcode-terminal";
import * as process from "process";
import { exec } from "child_process";
import * as fs from "fs";

// const Utils = require("whatsapp-web.js/src/util/Util.js");

const isWin = process.platform === "win32";

const options = {
  authStrategy: new LocalAuth(),
  puppeteer: {
    channel: isWin ? "chrome" : undefined,
    executablePath: isWin ? undefined : "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
} as ClientOptions;
const client: Client = new Client(options);

client.on("qr", (qr: string) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("READY!");
});

client.on("message_create", (msg) => {
  sendSticker(msg);
});

client.on("message", (msg: Message) => {
  if (msg.fromMe) sendSticker(msg);
});

client.initialize();

async function sendSticker(msg: Message) {
  const stickerRequest =
    msg.body.toLowerCase() === "!sticker" ||
    msg.body.toLowerCase() === "sticker";
  const transparentStickerRequest = msg.body.toLowerCase() === "!!sticker";

  if (
    (stickerRequest || transparentStickerRequest) &&
    msg.hasMedia &&
    msg.type != MessageTypes.STICKER
  ) {
    console.log(`Detected sticker request from ${msg.author}. Creating...`);

    let receivedMedia = await msg.downloadMedia();

    if (transparentStickerRequest && receivedMedia.mimetype.includes("jpeg")) {
      saveBase64AsFile(receivedMedia);
      receivedMedia = await removeBg(MessageMedia.fromFilePath("image.jpeg"));
    }

    await client.sendMessage(msg.fromMe ? msg.to : msg.from, receivedMedia, {
      sendMediaAsSticker: true,
    } as MessageSendOptions);
  }
}

/*
async function convertToSticker(media: MessageMedia) {
  if (media.mimetype.includes("image"))
    return await Utils.formatImageToWebpSticker(media, client.pupPage);
  if (media.mimetype.includes("video"))
    return await Utils.formatVideoToWebpSticker(media, client.pupPage);
}
*/

function saveBase64AsFile(media: MessageMedia) {
  const buffer = Buffer.from(media.data, "base64");
  fs.writeFileSync("image.jpeg", buffer);
}

async function removeBg() {
  await executeCommand("rembg i image.jpeg image.png");
  await executeCommand("convert image.png -trim +repage image.png");
  return MessageMedia.fromFilePath("image.png");
}

const executeCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
};
