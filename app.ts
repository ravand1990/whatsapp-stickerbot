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

const Utils = require("whatsapp-web.js/src/util/Util.js");

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
  if (
    msg.body.toLowerCase().includes("!sticker") &&
    msg.hasMedia &&
    msg.type != MessageTypes.STICKER
  ) {
    console.log(`Detected sticker request from ${msg.author}. Creating...`);
    const receivedMedia = await msg.downloadMedia();
    // let sticker = await convertToSticker(receivedMedia);
    await client.sendMessage(msg.fromMe ? msg.to : msg.from, receivedMedia, {
      sendMediaAsSticker: true,
    } as MessageSendOptions);
  }
}
async function convertToSticker(media: MessageMedia) {
  if (media.mimetype.includes("image"))
    return await Utils.formatImageToWebpSticker(media, client.pupPage);
  if (media.mimetype.includes("video"))
    return await Utils.formatVideoToWebpSticker(media, client.pupPage);
}
