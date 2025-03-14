const instruction = `Analyze this image in detail and generate a highly descriptive AI art generation prompt that can recreate it. 
Include details such as the subject, the gender, style, lighting, mood, colors, and composition. Ensure the description is structured to work well with AI art generators. 
Create the prompt in max 30 words!`



document.getElementById("inputImage").addEventListener("click", function () {
    document.getElementById("searchButtonText").classList.add("disabled");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async function (event) {
        await handleImageFile(event.target.files[0]);
    };

    input.oncancel = function (event) { // Add oncancel handler
        cancelImageReference();
    };

    input.click();
});

async function handleImageFile(file) {
    if (!file) return; // If no file selected, exit

    if (file.size >= 10 * 1024 * 1024) {
        alert("Please select an image file smaller than 10 MB.");
        return;
    }

    console.log("File accepted:", file.name);

    const reader = new FileReader();

    reader.onprogress = function (event) {
        if (event.lengthComputable) {
            const percentLoaded = Math.round((event.loaded / event.total) * 100);
            console.log(`Loading: ${percentLoaded}%`);
        }
    };

    reader.onload = async function () {
        console.log("File loaded successfully.");
        imageDataUrl = reader.result; // Get base64 data URL
        document.getElementById("samplePrompt").classList.add("image");
        document.getElementById("imageHolder").style.background = `url(${imageDataUrl})`;
        document.getElementById("imageHolder").style.backgroundSize = "cover";
        document.getElementById("imageHolder").style.backgroundPosition = "center center";
        document.getElementById("searchButtonText").classList.remove("disabled");
        imageMode = true;
        document.getElementById("enhancedPrompt").innerText = processedPrompt;

    };

    reader.readAsDataURL(file);
}


function cancelImageReference() {
    document.getElementById("samplePrompt").classList.remove("image");
    document.getElementById("imageHolder").style.background = "none";
    imageMode = false;
    document.getElementById("searchButtonText").classList.remove("disabled"); // Re-enable if disabled
    return;
}

document.getElementById("cancelImageMode").addEventListener("click", () => {
    cancelImageReference();
});

// Function to generate prompt from image
async function generatePromptFromImage(imageUrl, controller) {
    const userGivenprompt = document.getElementById("promptTextInput").value;

    try {
        const response = await fetch("https://text.pollinations.ai/openai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Analyse the image and capture all the details, incudeing scene, facial expressions, looks and what not amnd and then try mixing with the taste of the user prompt too -- Prompt: ${userGivenprompt}`
                            },
                            { type: "image_url", image_url: { url: imageUrl } }
                        ]
                    }
                ],
                model: "openai-large"
            }),
            signal: controller.signal // Attach the signal for aborting
        });

        if (controller.signal.aborted) {
            console.log("Generation was aborted.");
            notify("Generation was aborted.");
            handleStaticMode();
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            console.error("No valid response received.");
            notify("Bruuh!, Couldn't Understand the Image");
            return userGivenprompt;
        }
    } catch (error) {
        if (controller.signal.aborted) {
            console.log("Generation was aborted.");
            notify("Generation was aborted.");
            handleStaticMode();
            return;
        }
        console.error("Error generating prompt:", error);
        notify("Generation was aborted.");
        handleStaticMode();
    }
}



document.getElementById("promptTextInput").addEventListener("paste", async (event) => {
    const items = (event.clipboardData || event.clipboardData).items;
    let blob = null;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
            blob = items[i].getAsFile();
            break;
        }
    }

    if (blob !== null) {
        event.preventDefault(); // Prevent default paste behavior
        if (blob.size >= 10 * 1024 * 1024) {
            alert("Please paste an image smaller than 10 MB.");
            return;
        }
        await handleImageFile(blob);
    }
});