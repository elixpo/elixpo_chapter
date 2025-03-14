function downloadBlob(blob) {
    const url = blob;
    const a = document.createElement('a');
    a.href = url;
    a.download = "elixpo-ai-generated-image.jpg"; // Set the file name to "elixpo-ai-generated-image.jpg"
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
}



// //added the change to allow watermarkes here
// function downloadBlobWatermark(blob) {
//     const watermarkImage = new Image();
//     const watermarkImageInverted = new Image();
//     watermarkImage.crossOrigin = "Anonymous";
//     watermarkImageInverted.crossOrigin = "Anonymous";
//     watermarkImage.src = "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20final.png?alt=media&token=4bdf46cb-c851-4638-a0ea-a2723c8d4038"
//     watermarkImageInverted.src = "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20inverted%20final.png?alt=media&token=4a7b007d-e5dc-4b56-aa7f-acc6446b1bbe"

//     const mainImage = new Image();
//     const url = blob;
//     mainImage.crossOrigin = "Anonymous";
//     mainImage.src = url;
//     mainImage.onload = () => {
//         const canvas = document.getElementById('canvas');
//         const ctx = canvas.getContext('2d');

//         // Set canvas dimensions to match the main image
//         canvas.width = mainImage.width;
//         canvas.height = mainImage.height;

//         // Draw the main image onto the canvas
//         ctx.drawImage(mainImage, 0, 0);

//         // Detect brightness in the bottom left corner
//         const sampleSize = 10; // Size of the sample area
//         const imageData = ctx.getImageData(0, canvas.height - sampleSize, sampleSize, sampleSize);
//         let totalBrightness = 0;
//         for (let i = 0; i < imageData.data.length; i += 4) {
//             const r = imageData.data[i];
//             const g = imageData.data[i + 1];
//             const b = imageData.data[i + 2];
//             // Calculate brightness using the formula
//             totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
//         }
//         const averageBrightness = totalBrightness / (imageData.data.length / 4);

//         // Choose the watermark based on the brightness
//         const selectedWatermark = averageBrightness < 128 ? watermarkImageInverted : watermarkImage;

//         selectedWatermark.onload = () => {
//             // Define the position for the watermark
//             const watermarkX = 10;
//             const watermarkY = canvas.height - selectedWatermark.height - 10;

//             const watermarkX_right = canvas.width - selectedWatermark.width - 10;
//             const watermarkY_right = 10;

//             // Draw the watermark onto the canvas
//             ctx.drawImage(selectedWatermark, watermarkX, watermarkY);
//             ctx.drawImage(selectedWatermark, watermarkX_right, watermarkY_right);
//             console.log("modified");

//             // Convert the canvas to a Blob and download it
//             canvas.toBlob(function(modifiedBlob) {
//                 const downloadUrl = URL.createObjectURL(modifiedBlob);
//                 const a = document.createElement('a');
//                 a.href = downloadUrl;
//                 a.download = "elixpo-ai-generated-image.jpg"; // Set the file name to "elixpo-ai-generated-image.jpg"
//                 document.body.appendChild(a);
//                 a.click();
//                 document.body.removeChild(a);
//                 URL.revokeObjectURL(downloadUrl);
//             });
//         };
//     };

//     document.getElementById("savedMsg").classList.add("display");
//     setTimeout(() => {
//         document.getElementById("savedMsg").classList.remove("display");
//     }, 1500);
// }