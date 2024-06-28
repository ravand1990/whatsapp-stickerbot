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
    const messageBody = msg.body.toString().toLowerCase();
    const stickerRequest =
      messageBody === "!test" ||
      messageBody === "!sticker" ||
      messageBody === "sticker" ||
      messageBody === "! sticker";

    const transparentStickerRequest =
      messageBody === "!!test" ||
      messageBody === "!!sticker" ||
      messageBody === "!! sticker";

    const multiTransparentStickerRequest =
      messageBody === "!!!test" ||
      messageBody === "!!!sticker" ||
      messageBody === "!!! sticker";

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

      if (transparentStickerRequest && isVideo) {
        processedMedia.push(
          await videoToTransparentWebp(await trimAndResizeVideo(savedFilePath)),
        );
      }

      msg.react("✅");

      for (const media of processedMedia) {
        msg.reply(media, msg.fromMe || isWin ? msg.to : msg.from, {
          stickerAuthor: "ravands_stickerbot",
          sendMediaAsSticker: true,
          stickerCategories: ["stickerbot"],
        });
      }
    }
  } catch (e: any) {
    msg.react("❌");
    console.log("e.message", e.message);
    console.log("e.stack", e.stack);
  }
}

function saveBase64AsFile(from: string, media: MessageMedia) {
  const extension = media.mimetype.includes("jpeg") ? "jpeg" : "mp4";
  const buffer = Buffer.from(media.data, "base64");
  let path = `sticker/${from}`;
  fs.mkdirSync(path, { recursive: true });
  let filePath = `${path}/input.${extension}`;
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function removeBg(
  filePath: string,
  isVideo = false,
  model: null | string | undefined = null,
) {
  const dirname = path.dirname(filePath);
  const fileName = path.basename(filePath).split(".")[0];
  const ext = isVideo ? ".webp" : ".png";
  const outFile = fileName + (model ? "_" + model : "") + ext;

  console.log(`Saving rembg image to ${outFile}`);

  const dimensions = imageSize.imageSize(filePath);

  const isSam = model === "sam";
  // @ts-ignore
  const pointData = [dimensions.width / 2, dimensions.height / 2];
  const sam = { sam_prompt: [{ type: "point", data: pointData, label: 1 }] };

  const samParams = isSam ? `-x '${JSON.stringify(sam)}'` : "";

  if (!isVideo) {
    await executeCommand(
      `rembg i ${model ? `-m ${model}` : ""} ${isSam ? samParams : ""} ${filePath} ${dirname}/${outFile}`,
    );
  }

  await executeCommand(
    `convert ${dirname}/${outFile} -trim +repage ${dirname}/${outFile}`,
  );

  let command = `pngquant ${dirname}/${outFile} --output ${dirname}/${outFile} -f`;
  await executeCommand(command);

  const trimmedDimensions = imageSize.imageSize(`${dirname}/${outFile}`);

  console.log("trimmedDimensions", trimmedDimensions);

  return {
    ...MessageMedia.fromFilePath(`${dirname}/${outFile}`),
    trimmedDimensions,
  };
}

async function removeBgSequentially(frames: string[]) {
  const chunkSize = 20; // Number of frames to process at a time
  let processedFrames: any = [];

  const maxDimensions = { width: 0, height: 0 };

  // Helper function to process a chunk of frames
  async function processChunk(chunk: string[]) {
    return await Promise.all(chunk.map((frame) => removeBg(frame)));
  }

  console.log("maxDimensions", maxDimensions);

  // Creating chunks and processing them sequentially
  for (let i = 0; i < frames.length; i += chunkSize) {
    // Creating a chunk
    const chunk = frames.slice(i, i + chunkSize);
    console.log(`Processing frames ${i} to ${i + chunkSize - 1}...`);

    // Processing the current chunk
    processedFrames.push(await processChunk(chunk));
  }
  return processedFrames;
}

async function trimAndResizeVideo(filePath: string) {
  console.log("Trimming video...");
  let trimmedFilePath = filePath.replace(".mp4", "_trimmed.mp4");
  let resizedFilePath = filePath.replace(".mp4", "_resized.mp4");

  let command = `ffmpeg -y -i ${filePath} -ss 00:00:00 -to 00:00:10 ${trimmedFilePath}`;
  let result = await executeCommand(command);

  if (result.stderr) {
    console.log("result.stderr", result.stderr);
  }

  command = `ffmpeg -i ${trimmedFilePath} -vf "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease" -c:a copy -y ${resizedFilePath}`;
  result = await executeCommand(command);

  if (result.stderr) {
    console.log("result.stderr", result.stderr);
  }

  return resizedFilePath;
}

async function videoToTransparentWebp(filePath: string) {
  const dirname = path.dirname(filePath);

  console.log("Generating frames from Video...");

  const ffprobe = (
    await executeCommand(
      `ffprobe -v 0 -of csv=p=0 -select_streams v:0 -show_entries stream=r_frame_rate ${filePath}`,
    )
  ).stdout
    .replace("\r\n", "")
    .split("/");
  const fps = Math.floor(ffprobe[0] / ffprobe[1]);

  console.log("FPS of Video is: " + fps);
  fs.mkdirSync(dirname, { recursive: true });

  await executeCommand(
    `ffmpeg -y -i ${filePath} -compression_level 6 ${dirname}/out-%03d.jpeg`,
  );

  console.log("Frames generated successfully!");

  let regex = /[.]jpeg$/;

  const frames = fs
    .readdirSync(dirname)
    .filter((f) => regex.test(f))
    .map((frame, i) => `${dirname}/${frame}`);

  const transparentFrames = await removeBgSequentially(frames);

  const maxDimensions = { width: 0, height: 0 };

  for (const transparentFrame of transparentFrames || []) {
    if (
      transparentFrame.trimmedDimensions &&
      transparentFrame.trimmedDimensions.width
    ) {
      if (transparentFrame.trimmedDimensions.width > maxDimensions.width)
        maxDimensions.width = transparentFrame.trimmedDimensions.width;
    }
    if (
      transparentFrame.trimmedDimensions &&
      transparentFrame.trimmedDimensions.height
    ) {
      if (transparentFrame.trimmedDimensions.height > maxDimensions.height)
        maxDimensions.height = transparentFrame.trimmedDimensions.height;
    }
  }

  console.log("maxDimensions", maxDimensions);

  console.log("Frames BG removed!");

  frames.map((frame) => fs.unlinkSync(frame));

  console.log("JPEG-Frames removed!");

  await executeCommand(
    `cd ${dirname} && ffmpeg -framerate ${fps} -i out-%03d.png -c:v libwebp_anim -loop 0 -an -vf "scale=${maxDimensions.width}:${maxDimensions.height}:force_original_aspect_ratio=decrease,format=rgba" -q 1 -y output.webp`,
  );

  console.log("Gif created successfull!");

  regex = /[.]png$/;
  fs.readdirSync(dirname)
    .filter((f) => regex.test(f))
    .map((f) => fs.unlinkSync(path.join(dirname, f)));

  // fs.unlinkSync(`${filePath}/${filePath}_trimmed.mp4`);

  return MessageMedia.fromFilePath(`${dirname}/output.webp`);
}

const executeCommand: (command: string) => Promise<{
  // @ts-ignore
  stdout;
  // @ts-ignore

  stderr;
}> = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) console.log("CONSOLE ERROR:\n", stdout);

      if (error) {
        reject(error);
        return;
      }
      if (stdout) console.log("CONSOLE:\n", stdout);
      if (stderr) console.log("CONSOLE ERROR:\n", stdout);
      resolve({ stdout, stderr });
    });
  });
};
