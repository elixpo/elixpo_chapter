
const promptTextInput = document.getElementById("promptTextInput");
let controller;

async function generateImageAsync(prompt, width, height, seed, aspectRatio, theme, model, genNumber, numberOfImages, controller) {
    document.getElementById("NotifTxt").innerText = "Generating Images...";
    document.getElementById("savedMsg").classList.add("display");
    var privateImage = privateMode;
    console.log("private mode is ", privateImage);
    if (enhanceMode) {
        imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=1&enhance=true&private=${privateImage}`;
    } else {
        imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=1&enhance=false&private=${privateImage}`;
    }
    
    const imageTile = document.querySelector(".imageTile" + genNumber);
    imageTile.classList.add("generating");
    specialDir = localStorage.getItem("ElixpoAIUser") + "_" + Date.now();
    document.getElementById("generationTimeMask" + genNumber).style.animation = "loadingFlash 2s linear infinite";
    document.getElementById("generatedSeedIcon" + genNumber).style.animation = "loadingFlash 2s linear infinite";
    document.getElementById("generatedSeedIcon" + genNumber).style.color = "#00ff73";

    const startTime = Date.now();

    try {
        return new Promise(async (resolve, reject) => { 
            const imgElement = document.getElementById("imageRecieve" + genNumber);

            if (!imgElement) {
                reject(`Element with ID "imageRecieve${genNumber}" not found.`);
                return;
            }

            try {
                serverReturnStatus = true;
                const response = await fetch(`${downloadUrl}/download-image`, {  // Stream image
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ imageUrl }),
                    signal: controller.signal,
                    mode: "cors"
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                // Stream the response body into an array buffer
                const reader = response.body.getReader();
                let chunks = [];
                let done = false;

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    if (value) {
                        chunks.push(value);
                    }
                    done = readerDone;
                }

                // Concatenate the chunks and convert to base64
                const imageBlob = new Blob(chunks);
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(",")[1]);
                    reader.readAsDataURL(imageBlob);
                });

                const url = `data:image/png;base64,${base64}`;
                const blob = await fetch(url).then(res => res.blob());
                blobs.push(blob);

                imgElement.onload = () => {
                    const endTime = Date.now();
                    const generationTime = Math.round((endTime - startTime) / 1000);
                    if (generationTime > 9) {
                        document.querySelector(".imageTiles .maskImageTile" + genNumber + " .creationStats .generationTime").style.fontSize = "1.5em";
                        document.querySelector(".imageTiles .maskImageTile" + genNumber + " .creationStats .generationAspectRatio").style.fontSize = "1.5em";
                        document.getElementById("expansionIcon" + genNumber).classList.remove("hidden");
                    }
                    document.getElementById("generationTime" + genNumber).innerText = `${generationTime}s`;
                    document.getElementById("generationAspectRatio" + genNumber).innerText = `${aspectRatio}`;
                    document.getElementById("generatedSeed" + genNumber).innerText = seed;
                    document.getElementById("generationTheme" + genNumber).innerText = theme;
                    const encodedData = url + "###" + prompt + "###" + localStorage.getItem("ElixpoAIUser") + "###" + genNumber;
                    document.getElementById("maskImageTile" + genNumber).setAttribute("data-id", encodedData);

                    if (imageTile) {
                        imageTile.classList.remove("generating");
                        imageTile.classList.add("generated");
                        document.getElementById("generationTimeMask" + genNumber).style.animation = "none";
                        document.getElementById("generatedSeedIcon" + genNumber).style.animation = "none";
                        document.getElementById("generatedSeedIcon" + genNumber).style.color = "#fff";
                        document.getElementById("expansionIcon" + genNumber).classList.add("shrink");
                        document.getElementById("maskImageTile" + genNumber).classList.add("expand");
                    }

                    // Remove blur effect
                    imgElement.style.filter = 'blur(0)';
                    resolve();
                };

                // Add blur effect initially
                imgElement.style.filter = 'blur(10px)';
                imgElement.src = url;

                controller.signal.addEventListener('abort', () => {
                    imgElement.src = '';
                    reject(new Error('Image generation aborted.'));
                    handleStaticModeExclusive(currentIndex + 1);
                });
            } catch (error) {
                console.error('Error streaming image:', error);
                reject(error);
            }
        });
    } catch (error) {
        console.error('Error starting image generation:', error);
        document.getElementById("NotifTxt").innerText = "Error generating image";
        document.getElementById("savedMsg").classList.add("display");
        setTimeout(() => {
            document.getElementById("savedMsg").classList.remove("display");
        }, 1500);
        document.getElementById("NotifTxt").innerText = "Greetings";
    }
}

        

        
// Function to generate multiple images in parallel
async function generateMultipleImages(encodedPrompt, width, height, seeds, aspectRatio, theme, model, numberOfImages, controller) {
    const promises = [];

    for (let i = 0; i < numberOfImages; i++) {
        const genNumber = (i + 1).toString();
        promises.push(generateImageAsync(encodedPrompt, width, height, seeds[i], aspectRatio, theme, model, genNumber, numberOfImages, controller));
    }

    try {
        await Promise.all(promises);
        console.log("All images generated successfully.");
        (document.getElementById("samplePrompt").classList.add("generated"));
        cancelImageReference();
        document.getElementById("stopGeneration").classList.add("hidden");
        generating = false;
        imageMode = false;
        // tokenDeduct(aspectRatio, theme, numberOfImages);
        document.getElementById("rejectBtn").classList.remove("hidden");
        if ((privateMode) || !serverReturnStatus) {
            document.getElementById("acceptBtn").classList.add("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings - (Private Result)";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display"); 
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings!";
        } 
        else if (!privateMode && serverReturnStatus) {
            document.getElementById("acceptBtn").classList.remove("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display");
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
        } 
        else{
            document.getElementById("acceptBtn").classList.remove("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display");
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
        }
    } catch (error) {
        if (controller.signal.aborted) {
            console.log("Image generation stopped.");
        } else {
            console.error("Error generating images:", error);
            cancelImageReference();
            document.getElementById("NotifTxt").innerText = "Server Offline!";
            document.getElementById("savedMsg").classList.add("display"); 
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display"); 
            }, 1500);
            document.getElementById("NotifTxt").innerText = "Greetings";
            handleStaticModeExclusive(currentIndex + 1);
        }
    }
}


document.getElementById("stopGeneration").addEventListener("click", () => {
    if (controller) {
        controller.abort();
        // Clear the src attribute of all img elements
        handleStaticMode(currentIndex+1);
    }
});

function handleStaticMode(numberOfImages) {
    generating = false;
    blobs = [];
    cancelImageReference();
    for (let i = 1; i <= numberOfImages; i++) {
        const imgElement = document.getElementById("imageRecieve" + i.toString());

        if (imgElement) {
            imgElement.src = '';
            document.getElementById("generationTime"+i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generated");
            document.getElementById("generationAspectRatio"+i).innerText = "";
            document.getElementById("generatedSeed"+i).innerText = "";
            document.getElementById("generationTheme" + i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generating");
            document.getElementById("expansionIcon"+i).classList.add("hidden");
            document.getElementById("expansionIcon"+i).classList.remove("shrink");
            document.getElementById("maskImageTile"+i).classList.remove("expand");
        }
    }
    document.getElementById("samplePrompt").classList.remove("generating");
    
    if (document.getElementById("samplePrompt").classList.contains("generated")) {
        document.getElementById("samplePrompt").classList.remove("generated");
        document.getElementById("samplePrompt").style.height = "150px";
    }
    document.getElementById("imageTiles").classList.add("hidden");
    setTimeout(() => {
        document.getElementById("stopGeneration").classList.add("hidden");
    document.getElementById("typeOfImageTile").classList.remove("hidden");
    document.getElementById("typeOfModelTile").classList.remove("hidden");
    document.getElementById("aspectRatioControls").classList.remove("hidden");
    document.getElementById("aiEnhancementDesc").classList.remove("hidden");
    document.getElementById("privatePublicResultDesc").classList.remove("hidden");
    document.getElementById("enhancingMessage").classList.remove("noEnhancement");
    document.getElementById("enhancedPrompt").innerText = "";
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("enhancementAI").classList.add("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("promptTextInput").value = "";
    document.querySelector(".progressBar").classList.add("zeroProgress");
    document.querySelector("."+imageVarType).style.opacity = "1";
    document.querySelector("."+modelType).style.opacity = "1";
    document.getElementById("savedMsg").classList.remove("display");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("statusImage1").innerHTML = "";
    document.getElementById("statusImage2").innerHTML = "";
    document.getElementById("statusImage3").innerHTML = "";
    document.getElementById("statusImage4").innerHTML = "";
    document.getElementById("samplePrompt").style.height = "130px";
    specialDir = "";
    encodedPrompt = "";
    },1500)
    
}


document.getElementById("rejectBtn").addEventListener("click", () => {
    handleStaticModeExclusive(currentIndex+1);
});

document.getElementById("acceptBtn").addEventListener("click", () => {
    handleStaticServerUpload(blobs, blobs.length, imageVarType, modelType, specialDir ,0);
});



async function gettotalGenOnServer() {
    try {
        const snapshot = await db.collection('Server').doc("totalGen").get();
        console.log("Total Gen:", snapshot.data().value);
        let totalGen = parseInt(snapshot.data().value);
        return totalGen;
    } catch (error) {
        console.error("Error getting total generation count:", error);
        return 0;
    }
}


function generateUniqueId(inputString) {
    // Get the current timestamp
    const timestamp = Date.now().toString();

    // Concatenate the input string and the timestamp
    let combined = inputString + timestamp;

    // Shuffle the combined string
    combined = combined.split('').sort(() => Math.random() - 0.5).join('');

    // Generate a unique alphanumeric ID by slicing the shuffled string
    const uniqueId = combined.slice(0, 10); // You can adjust the length of the ID by changing this value

    return uniqueId;
}


async function handleStaticServerUpload(blobs, imageNumber, imgTheme, model, specialDir, progress = 0) {
    generating = false;
    document.getElementById("NotifTxt").innerText = "Uploading Images...";
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("progressBar").classList.remove("zeroProgress");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("enhancedPrompt").innerHTML = "";

    
    var currentTotalImageOnServer = await gettotalGenOnServer();
    console.log("Current Total Image on Server:", currentTotalImageOnServer);
    var nextImageNumber = currentTotalImageOnServer + 1;
    console.log("Next Image Number:", nextImageNumber);
    
    return new Promise(async (resolve, reject) => {
        try {
            const imageGenId = generateUniqueId(localStorage.getItem("ElixpoAIUser").toLowerCase());
            const storageRef = firebase.storage().ref();
            const timestamp = Date.now();
            const uploadPromises = [];
            let imageUrls = [];  // To store image URLs for Instagram upload

            if (enhanceMode) {
                ai_enhanced_prompt = document.getElementById("enhancedPrompt").innerText;
            }

            // Prepare upload tasks for each blob
            blobs.forEach((blob, index) => {
                const imageRef = storageRef.child(`generatedImages/${imgTheme}/image_${timestamp}_${index}.png`);
                const uploadTask = imageRef.put(blob);

                // Track upload progress
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log(`Image ${index + 1} upload is ${currentProgress}% done`);
                    },
                    (error) => {
                        console.error(`Error during upload of image ${index + 1}:`, error);
                        reject(error);
                    },
                    async () => {
                        try {
                            const url = await imageRef.getDownloadURL();
                            console.log(`Download URL for image ${index + 1}:`, url);
                            imageUrls.push(url);  // Add URL to array for Instagram upload
                            
                            // Update Firestore with image metadata
                            await db.collection("ImageGen").doc(specialDir).set({
                                theme: imgTheme,
                                model : model,
                                timestamp: timestamp,
                                user: localStorage.getItem("ElixpoAIUser"),
                                prompt: promptTextInput.value,
                                ratio: RatioValue,
                                ai_enhanced: enhanceMode,
                                total_gen_number: blobs.length,
                                genNum: nextImageNumber,
                                formatted_prompt: "",
                                tags: "",
                                hashtags: "",
                                date : new Date().toDateString(),
                                imgId: imageGenId
                            });
                            await db.collection("ImageGen").doc(specialDir).update({
                                [`Imgurl${index}`]: url,
                            });

                            progress += 1;
                            let prog = Math.round((progress / imageNumber) * 100);
                            document.getElementById("progressBarAccept").style.width = prog + "%";

                            // Check if all uploads are complete
                            if (progress === blobs.length) {
                                console.log("All images uploaded successfully.");
                                cancelImageReference();
                                generating = false;
                                setTimeout(() => {
                                    document.getElementById("NotifTxt").innerText = "Uploading to Instagram @elixpo_ai";
                                }, 1500);
                                document.getElementById("progressBarAccept").style.width = 0 + "%";
                                document.getElementById("savedMsg").classList.add("display");

                                // Update total generated images on server
                                await db.collection("Server").doc("totalGen").update({
                                    value: nextImageNumber,
                                });
                                handleStaticMode(imageNumber);
                            }
                        } catch (error) {
                            console.error(`Error getting download URL or updating database for image ${index + 1}:`, error);
                            document.getElementById("NotifTxt").innerText = "Upload Failed!";
                            document.getElementById("savedMsg").classList.add("display");
                            setTimeout(() => {
                                document.getElementById("savedMsg").classList.remove("display");
                            }, 1500);
                            document.getElementById("NotifTxt").innerText = "Greetings";
                            handleStaticMode(currentIndex + 1);
                            reject(error);
                        }
                    }
                );

                // Store the promise for this upload
                uploadPromises.push(uploadTask);
            });

            // Wait for all upload tasks to complete
            await Promise.all(uploadPromises.map(task => task));

        } catch (error) {
            console.error("Error uploading images:", error);
            reject(error);
        }
    });
}



function handleStaticModeExclusive(numberOfImages) {
    blobs = [];
    cancelImageReference();
    for (let i = 1; i <= numberOfImages; i++) {
        const imgElement = document.getElementById("imageRecieve" + i.toString());

        if (imgElement) {
            imgElement.src = '';
            document.getElementById("generationTime"+i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generated");
            document.getElementById("generationAspectRatio"+i).innerText = "";
            document.getElementById("generatedSeed"+i).innerText = "";
            document.getElementById("generationTheme" + i).innerText = "";
            document.querySelector(".imageTile"+i).classList.remove("generating");
            document.getElementById("expansionIcon"+i).classList.add("hidden");
            document.getElementById("expansionIcon"+i).classList.remove("shrink");
            document.getElementById("maskImageTile"+i).classList.remove("expand");

        }
    }
    document.getElementById("samplePrompt").classList.remove("generating");

    if (document.getElementById("samplePrompt").classList.contains("generated")) {
        document.getElementById("samplePrompt").classList.remove("generated");
    }

    document.getElementById("imageTiles").classList.add("hidden");

    setTimeout(() => {
    document.getElementById("stopGeneration").classList.add("hidden");
    document.getElementById("typeOfImageTile").classList.remove("hidden");
    document.getElementById("typeOfModelTile").classList.remove("hidden");
    document.getElementById("aspectRatioControls").classList.remove("hidden");
    document.getElementById("aiEnhancementDesc").classList.remove("hidden");
    document.getElementById("privatePublicResultDesc").classList.remove("hidden");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("enhancingMessage").classList.remove("noEnhancement");
    document.getElementById("enhancedPrompt").innerText = "";
    document.getElementById("enhancementAI").classList.add("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.querySelector(".progressBar").classList.add("zeroProgress");
    document.querySelector("."+imageVarType).style.opacity = "1";
    document.querySelector("."+modelType).style.opacity = "1";
    document.getElementById("statusImage1").innerHTML = "";
    document.getElementById("statusImage2").innerHTML = "";
    document.getElementById("statusImage3").innerHTML = "";
    document.getElementById("statusImage4").innerHTML = "";
    document.getElementById("samplePrompt").style.height = "130px";
    encodedPrompt = "";
    specialDir = "";
    },1500)
    
}


// Example of event listener setup (assuming it's triggered on button click)
document.getElementById("searchButtonText").addEventListener("click", async () => {
    console.log("Search Button Clicked");
    const promptTextInput = document.getElementById("promptTextInput");
    if (promptTextInput.value.trim() !== "") {
        generatingModeHandle();
    } else {
        document.getElementById("promptTextInput").setAttribute("placeholder", "An Empty Thought? Tell me something!");
        setTimeout(() => {
            document.getElementById("promptTextInput").setAttribute("placeholder", "What's on your mind?");
        }, 3000);
        document.getElementById("promptTextInput").focus();
    }
});



async function enhancePrompt(instructionPrompt="") {
    try {
        document.getElementById("textLoadingAnim1").style.opacity = "1";
        document.getElementById("textLoadingAnim2").style.opacity = "1";
        document.getElementById("textLoadingAnim3").style.opacity = "1";
        let prompt = document.getElementById("promptTextInput").value.trim();
        if (instructionPrompt) {
            prompt = prompt+instructionPrompt;
        }
        const seed = Math.floor(Math.random() * 1000000);
        const response = await fetch(`${enhanceUrl}/enhance-prompt`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, seed }),
            mode: "cors"
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";
        return data.enhancedPrompt;
        
    } catch (error) {
        console.error('Error enhancing prompt:', error);
        return prompt; // Return the original prompt in case of error
    }
}

async function generatingModeHandle() {
    generating = true;
    suffixPrompt = "";
    document.getElementById("samplePrompt").classList.add("generating");
    document.getElementById("samplePrompt").style.height = "60px";
    document.getElementById("typeOfImageTile").classList.add("hidden");
    document.getElementById("typeOfModelTile").classList.add("hidden");
    document.getElementById("aspectRatioControls").classList.add("hidden");
    document.getElementById("imageTiles").classList.remove("hidden");
    document.getElementById("stopGeneration").classList.remove("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");

    let finalPrompt = document.getElementById("promptTextInput").value.trim(); // Initial prompt
    let enhancementProcessed = false;

    if(imageMode)
    {
        document.getElementById("NotifTxt").innerText = "Just 2 mins! Trying to understand the image!";
            document.getElementById("savedMsg").classList.add("display"); 
           
        document.getElementById("textLoadingAnim1").style.opacity = "0";
        document.getElementById("textLoadingAnim2").style.opacity = "0";
        document.getElementById("textLoadingAnim3").style.opacity = "0";
        document.getElementById("enhancedPrompt").innerText = `Let's see what we can create from this image...`;
        processedPrompt = await generatePromptFromImage(imageDataUrl);
        console.log(processedPrompt);
        document.getElementById("enhancedPrompt").innerText = processedPrompt;
        document.getElementById("savedMsg").classList.remove("display"); 
        document.getElementById("NotifTxt").innerText = "Greetings";

        if (enhanceMode) {
            enhancementProcessed = true;
            document.getElementById("aiEnhancementDesc").classList.add("hidden");
            document.getElementById("privatePublicResultDesc").classList.add("hidden");
            if (!document.getElementById("enhancingMessage").classList.contains("hidden")) {
                document.getElementById("isoAIEnhancement").classList.add("hidden");
            }
            document.getElementById("enhancementAI").classList.remove("hidden");
            document.getElementById("isoAIEnhancement").classList.add("hidden");
            document.getElementById("enhancingMessage").classList.add("noEnhancement");

            try {
                let combinedPrompt = `${finalPrompt} ${processedPrompt}`;
                const result = await enhancePrompt(combinedPrompt);
                document.getElementById("enhancedPrompt").innerText = result;
                processedPrompt = result;
            } catch (error) {
                console.error("Error enhancing prompt:", error);
                document.getElementById("enhancedPrompt").innerText = "Enhancement failed";
            }

            finalPrompt = `${processedPrompt}`; // Combine user input with enhanced prompt
            console.log(finalPrompt);
        } else {
            finalPrompt = `${processedPrompt}`; // Combine user input with image-derived prompt
            console.log(finalPrompt);
        }


    } else if (enhanceMode) {
        document.getElementById("enhancedPrompt").innerText = "Thinking about what you just said...";
        enhancementProcessed = true;
        document.getElementById("aiEnhancementDesc").classList.add("hidden");
        document.getElementById("privatePublicResultDesc").classList.add("hidden");
        if (!document.getElementById("enhancingMessage").classList.contains("hidden")) {
            document.getElementById("isoAIEnhancement").classList.add("hidden");
        }
        document.getElementById("enhancementAI").classList.remove("hidden");
        document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.add("noEnhancement");

        try {
            const result = await enhancePrompt();
            document.getElementById("enhancedPrompt").innerText = result;
            finalPrompt = result; // Use the enhanced prompt as the final prompt
        } catch (error) {
            console.error("Error enhancing prompt:", error);
            document.getElementById("enhancedPrompt").innerText = "Enhancement failed";
        }
    }  else {
          // Set a default message immediately without waiting
          document.getElementById("aiEnhancementDesc").classList.add("hidden");
          document.getElementById("privatePublicResultDesc").classList.add("hidden");
          if (!document.getElementById("enhancingMessage").classList.contains("hidden")) {
              document.getElementById("isoAIEnhancement").classList.add("hidden");
          }
          document.getElementById("enhancingMessage").classList.add("noEnhancement");
          document.getElementById("enhancementAI").classList.remove("hidden");
          document.getElementById("isoAIEnhancement").classList.add("hidden");

           document.getElementById("enhancedPrompt").innerText = "Diffusing Images... In Progress";
    }

    if (!enhancementProcessed && !imageMode) {
      document.getElementById("aiEnhancementDesc").classList.add("hidden");
      document.getElementById("privatePublicResultDesc").classList.add("hidden");
      if (!document.getElementById("enhancingMessage").classList.contains("hidden")) {
        document.getElementById("isoAIEnhancement").classList.add("hidden");
      }
      document.getElementById("enhancingMessage").classList.add("noEnhancement");
      document.getElementById("enhancementAI").classList.remove("hidden");
      document.getElementById("isoAIEnhancement").classList.add("hidden");
      // Set a default message immediately without waiting
      document.getElementById("enhancedPrompt").innerText = "Diffusing Images... In Progress";
    }
  
  
    if (imageVarType == "Fantasy") {
      suffixPrompt = "in a magical fantasy setting, with mythical creatures and surreal landscapes";
    } else if (imageVarType == "Halloween") {
      suffixPrompt = "with spooky Halloween-themed elements, pumpkins, and eerie shadows";
    } else if (imageVarType == "Structure") {
      suffixPrompt = "in the style of monumental architecture, statues, or structural art";
    } else if (imageVarType == "Crayon") {
      suffixPrompt = "in the style of colorful crayon art with vibrant, childlike strokes";
    } else if (imageVarType == "Space") {
      suffixPrompt = "in a vast, cosmic space setting with stars, planets, and nebulae";
    } else if (imageVarType == "Chromatic") {
      suffixPrompt = "in a chromatic style with vibrant, shifting colors and gradients";
    } else if (imageVarType == "Cyberpunk") {
      suffixPrompt = "in a futuristic cyberpunk setting with neon lights and dystopian vibes";
    } else if (imageVarType == "Anime") {
      suffixPrompt = "in the style of anime, with detailed character designs and dynamic poses";
    } else if (imageVarType == "Landscape") {
      suffixPrompt = "depicting a breathtaking landscape with natural scenery and serene views";
    } else if (imageVarType == "Samurai") {
      suffixPrompt = "featuring a traditional samurai theme with warriors and ancient Japan";
    } else if (imageVarType == "Wpap") {
      suffixPrompt = "in the WPAP style with geometric shapes and vibrant pop-art colors";
    } else if (imageVarType == "Vintage") {
      suffixPrompt = "in a vintage, old-fashioned style with sepia tones and retro aesthetics";
    } else if (imageVarType == "Pixel") {
      suffixPrompt = "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics";
    } else if (imageVarType == "Normal") {
      suffixPrompt = "in a realistic and natural style with minimal artistic exaggeration";
    } else if (imageVarType == "Synthwave") {
      suffixPrompt = "in a retro-futuristic synthwave style with neon colors and 80s vibes";
    }
    
    let encodedPrompt = String(finalPrompt.trim()) + " " + suffixPrompt;
    let width, height;
    const isHQorLQ = false;
    console.log("image is being generated under " + isHQorLQ);
  
    switch (RatioValue) {
      case "1:1":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 2048 : 1024;
        break;
      case "9:16":
        width = isHQorLQ ? 1152 : 576;
        height = isHQorLQ ? 2048 : 1024;
        break;
      case "16:9":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 1152 : 576;
        break;
      case "4:3":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 1536 : 768;
        break;
      case "3:2":
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 1365 : 683;
        break;
      default:
        width = isHQorLQ ? 2048 : 1024;
        height = isHQorLQ ? 2048 : 1024;
        break;
    }
  
    const numberOfImages = currentIndex + 1;
    const seeds = generateSeeds(numberOfImages, 4, 6);
    for (let i = 1; i <= numberOfImages; i++) {
      document.getElementById("statusImage" + i).innerText = isHQorLQ ? "In Progress" : "Elixpo Generated";
    }
  
    controller = new AbortController();
  
    try {
      await generateMultipleImages(
        encodedPrompt,
        width,
        height,
        seeds,
        RatioValue,
        imageVarType,
        modelType,
        numberOfImages,
        controller
      );
    } catch (error) {
      console.error("Error fetching server URL:", error);
      document.getElementById("NotifTxt").innerText = "Error fetching server URL";
      document.getElementById("savedMsg").classList.add("display");
      setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
      }, 1500);
      document.getElementById("NotifTxt").innerText = "Greetings";
    }
  }


document.addEventListener('DOMContentLoaded', (event) => {
    const typeOfImageTile = document.getElementById('typeOfImageTile');
    const children = typeOfImageTile.getElementsByTagName('span');

    const typeofModels = document.getElementById('typeOfModelTile');
    const models = typeofModels.getElementsByTagName('span');


    Array.from(models).forEach(model => {
        model.addEventListener('click', () => {
            modelType = model.className;
            Array.from(models).forEach(m => {
                m.style.opacity = ".25";
                m.style.border = "none"
            });
            model.style.opacity = "1";
            model.style.border = "1px solid #f4bb00";
        });
    });

    Array.from(children).forEach(child => {
        child.addEventListener('click', () => {
            imageVarType = child.className;
            console.log(imageVarType);
            Array.from(children).forEach(c => {
                c.style.opacity = ".25";
                c.style.border = "none";
            });
            child.style.opacity = "1";
            child.style.border = "1px solid #f4bb00";
            document.getElementById("isoImageType").style.background = 'url("../../CSS/IMAGES/THEMES/'+imageVarType.toLowerCase().trim()+'.jpeg")';
            document.getElementById("isoImageType").style.backgroundSize = "cover";
            document.getElementById("isoImageType").style.backgroundPosition = "50% 30%";
            document.getElementById("themeNameIcon").innerHTML = imageVarType;
          
        });
        
    });
});

function generateSeeds(numSeeds = 6, minDigits = 4, maxDigits = 6) {
    const seeds = [];
    
    for (let i = 0; i < numSeeds; i++) {
        const numDigits = Math.floor(Math.random() * (maxDigits - minDigits + 1)) + minDigits;
        const min = Math.pow(10, numDigits - 1);
        const max = Math.pow(10, numDigits) - 1;
        const seed = Math.floor(Math.random() * (max - min + 1)) + min;
        seeds.push(seed);   
    }
    
    return seeds;
}



document.getElementById("downloadBox").addEventListener("click", (e) => {
    const downloadUrl = document.getElementById("downloadBox").getAttribute("data-id");
    downloadBlob(downloadUrl);
})


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




function copyTextFromDiv() {
    // Get the div element
    const div = document.getElementById('PromptDisplay');

    // Create a temporary textarea element to use for copying
    const textarea = document.createElement('textarea');
    textarea.value = div.innerText; // Get the inner text of the div
    document.body.appendChild(textarea);

    // Select and copy the text
    textarea.select();
    textarea.setSelectionRange(0, 99999); // For mobile devices
    document.execCommand('copy');

    // Remove the temporary textarea
    document.body.removeChild(textarea);

    // Optionally, give user feedback
    document.getElementById("NotifTxt").innerText = "Prompt Copied!";
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
    document.getElementById("NotifTxt").innerText = "Greetings!";
} 
document.getElementById('copyPrompt').addEventListener('click', copyTextFromDiv);

