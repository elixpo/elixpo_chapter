
document.getElementById("stopGeneration").addEventListener("click", () => {
    if (controller) {
        controller.abort();
        // Clear the src attribute of all img elements
        handleStaticMode(currentIndex+1);
        return;
    }
});

document.getElementById("rejectBtn").addEventListener("click", () => {
    handleStaticModeExclusive(currentIndex+1);
});

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


function handleStaticMode(numberOfImages) {
    console.log("aborting the image")
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
    controller = null;
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
    controller = null;
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
