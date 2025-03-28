

function notify(msg)
{
  document.getElementById("NotifTxt").innerText = `${msg}`;
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
      document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
}


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
    let systemInstructions = `
    firstlty understand the gender of the subject if a human is deteced or if multiple are detected
    secondly understand the if the image is a closeup or a long shot
    1. understand what the image is trying to depict.
    2. form a highly descriptive AI art generation prompt that can recreate it
    3. Include details such as the environment and other minute details 
    4. understand the mood, style, lighting, colors, and composition of the image
    5. take the user prompt into consideration and generate a prompt that can work well with AI art generators
    6. make the prompt as highly detailed as possible
    User Prompt: ${userGivenprompt}

    Decoded Prompt: "A beautiful sunset over the ocean with a silhouette of a palm tree in the foreground"
    User Prompt: "use a coconut tree in the foreground now"
    Output: "A beautiful sunset over the ocean with a silhouette of a coconut tree in the foreground with proper lighting and colors and a calm mood"

    Just output the final perfect combined ai prompt, no need to include the instructions and inner thoughts.

    `;
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
                                text: `${systemInstructions}`
                            },
                            { type: "image_url", image_url: { url: imageUrl } }
                        ]
                    }
                ],
                model: "claude-hybridspace"
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
            // console.log("Prompt generated:", data.choices[0].message.content);
            return data.choices[0].message.content;
        } else {

            notify("Generation was aborted.");
            handleStaticMode();
            console.error("No valid response received.");
           
            
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