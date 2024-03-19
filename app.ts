import {
  Client,
  ClientOptions,
  LocalAuth,
  Message,
  MessageMedia,
  MessageTypes,
} from "whatsapp-web.js";
import * as qrcode from "qrcode-terminal";
import * as process from "process";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as imageSize from "image-size";

// const Utils = require("whatsapp-web.js/src/util/Util.js");

const isWin = process.platform === "win32";

const MODELS = [
  "u2net",
  "u2netp",
  "u2net_human_seg",
  "isnet-general-use",
  // "sam",
];

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
  try {
    const messageBody = msg.body.toLowerCase();
    const stickerRequest =
      (isWin && messageBody === "!test") ||
      messageBody === "!sticker" ||
      messageBody === "sticker" ||
      messageBody === "! sticker";
    const transparentStickerRequest =
      messageBody === "!!sticker" || messageBody === "!! sticker";

    const multiTransparentStickerRequest =
      messageBody === "!!!sticker" || messageBody === "!!! sticker";

    if (
      (stickerRequest ||
        transparentStickerRequest ||
        multiTransparentStickerRequest) &&
      msg.hasMedia &&
      msg.type != MessageTypes.STICKER
    ) {
      console.log(`Detected sticker request from ${msg.author}. Creating...`);

      msg.react("⏳");

      let receivedMedia = await msg.downloadMedia();
      const processedMedia = [receivedMedia];

      const isImage = receivedMedia.mimetype.includes("jpeg");
      const isVideo = receivedMedia.mimetype.includes("mp4");

      const savedFilePath = saveBase64AsFile(msg.from, receivedMedia);

      if (transparentStickerRequest && isImage) {
        processedMedia.pop();
        processedMedia.push(await removeBg(savedFilePath));
      }

      if (multiTransparentStickerRequest && isImage) {
        processedMedia.pop();
        for (const model of MODELS) {
          console.log(`Trying model "${model}" ...`);
          processedMedia.push(await removeBg(savedFilePath, false, model));
        }
      }

      if (isVideo && msg.fromMe) {
        processedMedia.push(
          await videoToTransparentWebp(await trimVideo(savedFilePath)),
        );
      }

      msg.react("✅");

      for (const media of processedMedia) {
        console.log("media", media);

        msg.reply(media, msg.fromMe || isWin ? msg.to : msg.from, {
          stickerAuthor: "ravands_stickerbot",
          sendMediaAsSticker: true,
          stickerCategories: ["stickerbot"],
          // caption:
          //   "Model: " + media.filename != undefined
          //     ? media.filename
          //         .replace("output_", "")
          //         .replace(".png", "")
          //         .replace(".webp", "")
          //     : "",
        });
      }
    }
  } catch (e) {
    msg.react("❌");
    console.log("e.message", e.message);
    console.log("e.stack", e.stack);
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

function saveBase64AsFile(from, media: MessageMedia) {
  const extension = media.mimetype.includes("jpeg") ? "jpeg" : "mp4";
  const buffer = Buffer.from(media.data, "base64");
  let path = `sticker/${from}`;
  fs.mkdirSync(path, { recursive: true });
  let filePath = `${path}/input.${extension}`;
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function removeBg(filePath, isVideo = false, model = null) {
  const dirname = path.dirname(filePath);
  const ext = isVideo ? ".webp" : ".png";
  const outFile = "output_" + model + ext;

  console.log(`Saving rembg image to ${outFile}`);

  const dimensions = imageSize.imageSize(filePath);

  const isSam = model === "sam";
  const pointData = [dimensions.width / 2, dimensions.height / 2];
  const sam = { sam_prompt: [{ type: "point", data: pointData, label: 1 }] };

  const samParams = isSam ? `-x '${JSON.stringify(sam)}'` : "";

  if (isVideo)
    await executeCommand(
      `backgroundremover -i "${filePath}" -tv -o "${dirname}/output.mov" && ffmpeg -i ${dirname}/output.mov -vcodec libwebp_anim -q 60 -preset default -loop 0 -an -vsync 0 -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=#00000000" -y ${dirname}/${outFile}"`,
    );
  else
    await executeCommand(
      `rembg i ${model ? `-m ${model}` : ""} ${isSam ? samParams : ""} ${filePath} ${dirname}/${outFile}`,
    );

  if (!isWin)
    await executeCommand(
      `convert ${dirname}/${outFile} -trim +repage ${dirname}/${outFile}`,
    );
  return MessageMedia.fromFilePath(`${dirname}/${outFile}`);
}

async function removeBgSequentially(frames) {
  const chunkSize = 20; // Number of frames to process at a time

  // Helper function to process a chunk of frames
  async function processChunk(chunk) {
    await Promise.all(chunk.map((frame) => removeBg(frame)));
  }

  // Creating chunks and processing them sequentially
  for (let i = 0; i < frames.length; i += chunkSize) {
    // Creating a chunk
    const chunk = frames.slice(i, i + chunkSize);
    console.log(`Processing frames ${i} to ${i + chunkSize - 1}...`);

    // Processing the current chunk
    await processChunk(chunk);
  }
}

async function trimVideo(filePath) {
  console.log("Trimming video...");
  let trimmedFilePath = filePath.replace(".mp4", "_trimmed.mp4");

  const command = `ffmpeg -y -i ${filePath} -ss 00:00:00 -to 00:00:10 ${trimmedFilePath}`;
  const result = await executeCommand(command);
  if (result.stderr) {
    console.log("result.stderr", result.stderr);
  }
  return trimmedFilePath;
}

async function videoToTransparentWebp(filePath) {
  const dirname = path.dirname(filePath);

  console.log("Generating frames from Video...");

  const ffprobe = (
    await executeCommand(
      `ffprobe -v 0 -of csv=p=0 -select_streams v:0 -show_entries stream=r_frame_rate ${filePath}`,
    )
  ).stdout
    .replace("\r\n", "")
    .split("/");
  const fps = ffprobe[0] / ffprobe[1];

  fs.mkdirSync(dirname, { recursive: true });

  await executeCommand(
    `ffmpeg -y -i ${filePath} -compression_level 6 ${dirname}/out-%03d.jpeg`,
  );

  console.log("Frames generated successfully!");

  let regex = /[.]jpeg$/;

  const frames = fs
    .readdirSync(dirname)
    .filter((f) => regex.test(f))
    .map((frame) => `${dirname}/${frame}`);

  await removeBgSequentially(frames);

  console.log("Frames BG removed!");

  frames.map((frame) => fs.unlinkSync(frame));

  console.log("JPEG-Frames removed!");

  await executeCommand(
    `cd ${dirname} && ffmpeg -i out-%3d.png -framerate ${fps} -c:v libwebp_anim -filter:v fps=${fps} -lossless 0 -loop 0 -preset default -an -vsync 0 -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=#00000000" -quality 10 -y output.webp`,
  );

  console.log("Gif created successfull!");

  regex = /[.]png$/;
  fs.readdirSync(dirname)
    .filter((f) => regex.test(f))
    .map((f) => fs.unlinkSync(path.join(dirname, f)));

  // fs.unlinkSync(`${filePath}/${filePath}_trimmed.mp4`);

  return MessageMedia.fromFilePath(`${dirname}/output.webp`);
}

const executeCommand: (command) => Promise<{ stdout; stderr }> = (command) => {
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
