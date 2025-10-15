import { store } from "../initializeFirebase.js";
import fs from "fs";
import { compressProfilePic, imageToBase64 } from "./dctCompress.js";

export async function uploadProfilePic(imgData, uid) {
  try {
    const compressedImagePath = await compressProfilePic(imgData, uid, 10);     
    const bucket = store.bucket();
    const destination = `profile_pictures/${uid}/pfp_${Date.now()}.jpg`;
    await bucket.upload(compressedImagePath, {
        destination,
        metadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000',
        },
    });
    fs.unlinkSync(compressedImagePath);
    const file = bucket.file(destination);
    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2500', 
    });
    return url;
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    throw error;
  }
}

// Example usage
// let imgPath = "test.jpg";
// let data = imageToBase64(imgPath);
// let downloadURL = await uploadProfilePic(data, "testUser");
// console.log("Download URL:", downloadURL);