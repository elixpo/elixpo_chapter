import { store, collec } from "../initializeFirebase.js";
import fs from "fs";
import { compressProfilePic, imageToBase64 } from "./dctCompress.js";

export async function uploadProfilePic(req, res, imgData, uid) {
  try {
    const imageSizeInBytes = Buffer.byteLength(imgData, 'base64');
    const maxSizeInBytes = 1024 * 1024; // 1MB
    if (imageSizeInBytes > maxSizeInBytes) {
      return res.status(400).json({ 
        success: false, 
        error: "Image size exceeds 1MB limit" 
      });
    }
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

    try 
    {
        collec.collection('users').doc(uid).update({
        profilePicLink: url,
        updatedAt: new Date().toISOString()
    });
    res.status(200).json({ success: true, url: url });
    }
    catch (error)
    {
        console.error("Error updating Firestore with profile picture URL:", error);
        res.status(500).json({ success: false, url: url, error: "Failed to update profile picture URL in database." });
    }
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