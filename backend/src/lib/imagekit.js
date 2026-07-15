import ImageKit, { toFile } from "@imagekit/nodejs";

const imagekit = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY });

function hasImageKitConfig(){
    return Boolean(process.env.IMAGEKIT_PRIVATE_KEY);
}

function createFileName(originalName = "upload") {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    return `chat-${timestamp}-${safeName}`;
}

async function uploadChatMedia(file){
    const fileName = createFileName(file.originalname);

    const result = await imagekit.files.upload({
        file: await toFile(file.buffer, fileName, { type: file.mimetype }),
        fileName: fileName,
        folder: "/chat",
    })

    return result.url;
}

export { uploadChatMedia, hasImageKitConfig };