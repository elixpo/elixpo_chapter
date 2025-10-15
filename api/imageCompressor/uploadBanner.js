import { store, collec } from "../initializeFirebase.js";
import fs from "fs";
import { compressBannerPic, imageToBase64 } from "./dctCompress.js";

export async function uploadBanner(req, res, imgData, uid) {
  try {
    const compressedImagePath = await compressBannerPic(imgData, uid, 30);
    const bucket = store.bucket();
    const destination = `banner_images/${uid}/banner_${Date.now()}.jpg`;
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

    try 
    {
        collec.collection('users').doc(uid).update({
        bannerPicLink: url,
        updatedAt: new Date().toISOString()
    });
    res.status(200).json({ success: true, url: url });
    }
    catch (error)
    {
        console.error("Error updating Firestore with banner picture URL:", error);
        res.status(500).json({ success: false, url: url, error: "Failed to update banner picture URL in database." });
    }
  } catch (error) {
    console.error("Error uploading banner picture:", error);
    throw error;
  }
}

// Example usage
// let imgPath = "test.jpg";
// let data = imageToBase64(imgPath);
// let downloadURL = await uploadProfilePic(data, "testUser");
// console.log("Download URL:", downloadURL);