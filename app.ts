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

const options = {
  authStrategy: new LocalAuth(),
  puppeteer: { channel: "chrome" },
} as ClientOptions;
const client: Client = new Client(options);

client.on("qr", (qr: string) => {
  // Generate and scan this code with your phone
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message_create", (msg) => {
  sendSticker(msg);
});

client.on("message", (msg: Message) => {
  sendSticker(msg);
});

client.initialize();

async function sendSticker(msg: Message) {
  if (
    msg.body.toLowerCase().includes("!sticker") &&
    msg.hasMedia &&
    msg.type != MessageTypes.STICKER
  ) {
    const receivedMedia = await msg.downloadMedia();
    console.log("receivedMedia", receivedMedia);

    let sticker = await convertToSticker(receivedMedia);
    console.log("sticker", sticker);

    const sentMessage = await client.sendMessage(msg.to, receivedMedia, {
      sendMediaAsSticker: true,
    } as MessageSendOptions);
    console.log("sentMessage", sentMessage);
  }
}
async function convertToSticker(media: MessageMedia) {
  if (media.mimetype.includes("image"))
    return await Utils.formatImageToWebpSticker(media, client.pupPage);
  if (media.mimetype.includes("video"))
    return await Utils.formatVideoToWebpSticker(media, client.pupPage);
}
