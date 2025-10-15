import fs from "fs";
import path from "path";
import sharp from "sharp";

export function imageToBase64(filePath) {
  const fileData = fs.readFileSync(filePath);
  const base64 = fileData.toString("base64");

  const ext = filePath.split(".").pop().toLowerCase();
  const mimeType = ext === "png" ? "image/png"
                 : ext === "webp" ? "image/webp"
                 : "image/jpeg";

  return `data:${mimeType};base64,${base64}`;
}


export async function compressProfilePic(imgData, uid, quality = 15) {
  try {
    const base64Data = imgData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const userDir = path.join("../../profilePicUploads", uid);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    const outputPath = path.join(userDir, `pfp_compressed_${Date.now()}.jpg`);
    const existingFiles = fs.readdirSync(userDir).filter(file => file.endsWith('.jpg'));
    existingFiles.forEach(file => {
        fs.unlinkSync(path.join(userDir, file));
    });
    await sharp(buffer)
      .jpeg({
        quality,
        chromaSubsampling: "4:2:0",
        mozjpeg: true,
      })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error("Error compressing profile picture:", error);
    throw error;
  }
}



let imgPath = "test.jpg";
let data = imageToBase64(imgPath);
let compressedImageLocation  = await compressProfilePic(data, "testUser");
