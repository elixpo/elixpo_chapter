let extractedBase64Data = null;




document.getElementById("inputImage").addEventListener("click", function () {
    document.getElementById("generateButton").classList.add("disabled");
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
    if (!file) return;

    if (file.size >= 10 * 1024 * 1024) {
        notify("Please select an image file smaller than 10 MB.");
        return;
    }

    console.log("File accepted:", file.name);
    document.getElementById("cancelImageMode").classList.remove("hidden");
    document.getElementById("pimpPrompt").style.opacity = "0.5";
    document.getElementById("pimpPrompt").style.pointerEvents = "none";
    handleFlagUpdateAuto(".themes", "theme", "normal");
    handleFlagUpdateAuto(".models", "model", "gptimage");
    handleFlagUpdateAuto(".ratios", "ratio", "16:9");
    document.querySelectorAll(".modelsTiles").forEach(tile => {
       tile.style.pointerEvents = "none";
    });

    const uploadedUrl = await uploadImageToUguu(file);
    
    // Read the file for preview regardless of upload success
    const reader = new FileReader();
    reader.onload = async function () {
        console.log("File loaded successfully.");
        const imageDataUrl = reader.result;
        extractedBase64Data = imageDataUrl.split(",")[1];
        document.getElementById("promptBox").classList.add("image");
        document.getElementById("imageHolder").style.background = `url(${imageDataUrl})`;
        document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `url(${imageDataUrl})`);
        document.getElementById("imageHolder").style.backgroundSize = "cover";
        document.getElementById("imageHolder").style.backgroundPosition = "center center";
        document.getElementById("generateButton").classList.remove("disabled");
        isImageMode = true;
        // document.getElementById("imageHolder").setAttribute("data-uploaded-url", imageDataUrl);
        // console.log("Uploaded URL:", imageDataUrl);
        if (uploadedUrl) {
            document.getElementById("imageHolder").setAttribute("data-uploaded-url", uploadedUrl);
            console.log("Uploaded URL:", uploadedUrl);
        }
    };

    reader.readAsDataURL(file);
}

function cancelImageReference() {
    document.getElementById("promptBox").classList.remove("image");
    document.getElementById("imageHolder").style.background = "none";
    document.querySelector(".userInputImageHolder").style.setProperty("--before-background", `none`);
    isImageMode = false;
    handleFlagUpdateAuto(".models", "model", "flux");
    document.getElementById("generateButton").classList.remove("disabled"); 
    document.getElementById("pimpPrompt").style.opacity = "1";
    document.getElementById("pimpPrompt").style.pointerEvents = "all";
    document.getElementById("imageHolder").style.opacity = "1";
    document.getElementById("imageHolder").style.pointerEvents = "all";
    document.querySelector(".imageProcessingAnimation ").classList.remove("imageMode");
    document.querySelector(".imageThemeContainer").classList.remove("imageMode");
    document.getElementById("cancelImageMode").classList.add("hidden");
    document.getElementById("promptTextInput").classList.remove("blur");
    document.getElementById("overlay").classList.remove("display");
    document.getElementById("overlay").innerHTML = "";
    document.querySelectorAll(".modelsTiles").forEach(tile => {
        tile.style.pointerEvents = "none";
     });
    dismissNotification();
    notify("Image reference removed.");
    if (imageController) {
        imageController.abort(); 
        imageController = null;
    }
    if (imageTimeout) {
        clearTimeout(imageTimeout); 
        imageTimeout = null;
    }
    return;
}

document.getElementById("cancelImageMode").addEventListener("click", () => {
    cancelImageReference();
});

// Function to generate prompt from image
async function generatePromptFromImage(imageUrl, userGivenPrompt, controller) {
    console.log(userGivenPrompt);
    const systemInstructions = `
        AI Art Prompt Generator — Image Analysis + Creative Fusion

        Developer Role: Expert AI prompt engineer for visual-to-text generation.

        Objective:
        Analyze the provided input image in detail and generate a high-quality, natural language prompt 
        suitable for AI art generation. The prompt must reflect all key elements from the image while 
        thoughtfully merging the user’s creative request to produce a single, enriched prompt.

        Inputs:
        - image: The image to analyze (format: image file or image object)
        - userGivenPrompt: A short natural language instruction from the user to creatively modify the image prompt

        Process:
        1. Perform deep image analysis to extract the following elements:
            - Human Presence:
                - Count, gender, visible clothing, ethnicity (if visually apparent), accessories
                - Facial features, pose, emotion, expression
            - Age Estimate:
                - Classify as child, teenager, adult, or elderly
            - Camera Angle:
                - Identify shot type (close-up, mid-shot, wide-angle, aerial, etc.)
            - Environment:
                - Detect setting (urban, forest, sci-fi, bedroom, battlefield, etc.)
                - Include details like weather, background architecture, props, terrain
            - Mood & Emotion:
                - Derive from posture, lighting, color palette, and expressions
            - Art Style:
                - Determine (realism, anime, cyberpunk, 3D render, sketch, digital painting, etc.)
            - Lighting:
                - Describe (natural sunlight, cinematic, neon, soft glow, golden hour, moonlight, etc.)
            - Composition:
                - Note framing, depth, perspective, focus, rule of thirds usage

        2. Preserve all core visual traits:
            - Maintain identifiable features of subjects: clothing, gender identity, accessories, facial structure
            - Retain environmental anchors and recognizable spatial layout

        3. Merge the image analysis with the user’s request:
            - Seamlessly incorporate elements from ${userGivenPrompt} into the visual scene
            - Modify or extend setting, mood, characters, outfits, lighting, or style accordingly
            - Ensure the merged prompt feels natural, coherent, and imaginative

        4. Output:
            - A single high-quality natural language prompt (approx. 50–100 words)
            - Prompt should feel like a description ready for a text-to-image model
            - Avoid lists or segmentation — write as flowing, immersive narrative text

        Example Output Format:
        "A serene Japanese street at golden hour with an elderly man in traditional kimono gazing at cherry blossoms. The soft pastel lighting gently highlights his wrinkled face, conveying peace. Now reimagined in a futuristic cyberpunk Tokyo, the blossoms replaced by glowing neon vines, and the man wears a mechanized exosuit — a fusion of tradition and tech."
`;

    try {
        const base64Image = imageUrl.split(",")[1];

        const response = await fetch("https://text.pollinations.ai/openai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai",
                messages: [
                    {
                        role: "system",
                        content: systemInstructions.trim()
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analyze this image and build a refined generation prompt."
                            },
                            {
                                type: "image_url",
                                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                            }
                        ]
                    }
                ],
                max_tokens: 250 // Slightly increased to fit the merged prompt better
            })
        });

        const data = await response.json();

        if (!response.ok) {
            notify("Failed to reach the prompt server.");
            console.error("HTTP error:", response.status, await response.text());
            return false;
        }
        
        // Check for valid structure
        if (data?.choices?.length > 0 && data.choices[0]?.message?.content) {
            return data.choices[0].message.content.trim();
        } else {
            notify("Invalid response format from server.");
            console.error("Unexpected API response structure:", data);
            return false;
        }
        

    } catch (error) {
        if (controller.signal.aborted) {
            console.log("Generation was aborted.");
            notify("Generation was aborted.");
            return false;
        }
        console.error("Error generating prompt:", error);
        notify("Generation failed.");
        return false;
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


async function loadHardcodedImage() {
    const imageUrl = "../../CSS/IMAGES/testImg.jpg";
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "hardcoded_image.jpg", { type: "image/jpeg" });
        await handleImageFile(file);
        const reader = new FileReader();

        reader.onload = async function () {
            extractedBase64Data = reader.result.split(",")[1];
        };

        reader.readAsDataURL(file);
    } catch (error) {
        console.error("Error loading hardcoded image:", error);
        notify("Failed to load hardcoded image.");
    }
}

// window.onload = loadHardcodedImage;

//image mode bug
// handleImageFile();
