import { GoogleGenerativeAI } from "@google/generative-ai";
const firebaseConfig = {
    apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
    authDomain: "elixpoai.firebaseapp.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: "718153866206",
    appId: "1:718153866206:web:671c00aba47368b19cdb4f"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  let generating = false;
  let tokens = 0;
  let formatted_prompt = "";
  let hashtags = "";
  let tags = "";
  let enhanceUrl = '';
  let downloadUrl = '';
  let pingUrl = '';
  let tagUrl = '';
  let ai_enhanced_prompt = '';
//new commit
window.onload = function() {
    document.querySelector(".patternContainer").classList.remove("hidden");
    globalThis.imageVarType = "Fantasy";
    globalThis.RatioValue = "1:1";
    document.getElementById("imageTiles").classList.contains("hidden") ? document.querySelector("."+imageVarType).style.opacity = "1" : document.querySelector("."+imageVarType).style.opacity = "0";
    globalThis.width = 2048;
    globalThis.height = 2048;
    globalThis.encodedPrompt = "";
    globalThis.currentIndex = 0;
    globalThis.websiteStaticMode = "Static";
    globalThis.controller;
    globalThis.blobs = [];
    // localStorage.setItem("ElixpoAIUser", "circuit overtime");
    globalThis.imgProg = 0;
    globalThis.fileName = "ElixpoAI-Generated-Image.jpeg";
    globalThis.specialDir = "";
    
  
    
    document.getElementById("promptTextInput").focus();
    setInterval(() => {
        if (localStorage.getItem("ElixpoAIUser") == null) {
            location.href = "elixpo_homepage.html";
        } else {
            document.querySelector(".patternContainer").classList.add("hidden");
        }
    }, 1000);


    
    globalThis.serverRef = db.collection('Server').doc('servers');

   
 function getServerURLs() {
        serverRef.get().then(async (doc) => {
            if (doc.exists) {
                downloadUrl = await doc.data().download_image;
                pingUrl = await doc.data().get_ping;
                tagUrl = await doc.data().get_tags;
                enhanceUrl = await doc.data().pimp_prompt;

                console.log(`Server1 URL: ${downloadUrl}`);
                console.log(`Server2 URL: ${enhanceUrl}`);
                console.log(`Server3 URL: ${pingUrl}`);
                console.log(`Server4 URL: ${tagUrl}`);

                // Schedule pingServer after URLs are retrieved
                pingServer();
                setInterval(() => pingServer(), 20000);
            } else {
                console.log("No such document!");
            }
        }).catch((error) => {
            console.log("Error getting document:", error);
        });
}

async function pingServer() {
    try {
        const response = await fetch(`${pingUrl}/ping`, {
            method: "POST", // Use POST if you prefer to simulate heartbeat requests
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: 'heartbeat' }) // Send a heartbeat signal
        });

        if (response.ok) {
            console.log(`${pingUrl} is up`);
            document.getElementById("serverStatus").classList.remove("offline");
        } else {
            console.log(`${pingUrl} is down`);
            document.getElementById("serverStatus").classList.add("offline");
        }
    } catch (error) {
        console.log(`${pingUrl} is down`);
        document.getElementById("serverStatus").classList.add("offline");
    }
}

    getServerURLs();
    setInterval(getServerURLs, 30000);
};


db.collection("users").doc(localStorage.getItem("ElixpoAIUser").toLowerCase()).get().then((doc) => {
    if (doc.exists) {
        // console.log("Document data:", doc.data());
        document.getElementById("userLogo").style.backgroundImage = `url(${doc.data().user_logo})`;
    } else {
       console.log("No such document!");
    }
}).catch((error) => {
   location.reload();
});

db.collection("users").doc(localStorage.getItem("ElixpoAIUser").toLowerCase()).get().then((doc) => {
    if (doc.exists) {
        let coins = doc.data().coins;
        let formattedCoins;

        if (coins < 1000) {
            formattedCoins = coins;
        } else if (coins < 10000) {
            formattedCoins = `${(coins / 1000).toFixed(0)}K`;
        } else if (coins < 100000) {
            formattedCoins = `${(coins / 1000).toFixed(0)}K`;
        } else {
            formattedCoins = "100K";
        }

        document.getElementById("tokenValue").innerText = formattedCoins;
    } else {
        console.log("No such document!");
    }
}).catch((error) => {
    location.reload();
});


const diceIcon = document.getElementById('OneImage');
const diceClasses = ['fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four'];
const promptTextInput = document.getElementById("promptTextInput");
let controller;


const API_KEY = "AIzaSyASFyHF9z64nPDPvdljL1ETQXM2NaFTGBg";
    const genAI = new GoogleGenerativeAI(API_KEY);
    const modelConfig  = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `
            You are Elixpo, an AI prompt generator model developed by Elixpo Labs India.
            Elixpo enhances user-provided art prompts with a variety of predefined styles
            and adds personalized, fanciful details to create vivid and imaginative scenarios.
            Follow these steps for each user input:
            
            - Analyze User Input: Understand the core theme or concept of the user's input.
            - Enhance with Available Styles: Incorporate elements from one or more of the available styles to enrich the prompt.
            - Add Detailed Elements: Include specific details such as setting, characters, objects, and atmosphere.
            - Suggest an Art Style: Recommend an appropriate art style from the available options.
            - Create a Concise Prompt: Combine these elements into a concise, cohesive prompt that is more detailed and imaginative than the original user input. Ensure the enhanced prompt does not exceed 70 words.
            - Handling Questions: If a prompt seems like a direct question and lacks a defined answer, respond with: "Ask to paint, I am not good at answering questions."
            
            Available Styles:
            - Fantasy: Magical and mythical elements, enchanted settings.
            - Halloween: Spooky, eerie, and ghostly themes.
            - Euphoric: Bright, joyful, and uplifting atmosphere.
            - Crayon: Childlike, colorful, and playful.
            - Space: Futuristic, cosmic, and sci-fi settings.
            - Chromatic: Vibrant colors, rainbow effects, and high saturation.
            - Cyberpunk: Futuristic, dystopian, and neon-lit urban scenes.
            - Anime: Japanese animation style, exaggerated expressions, and dynamic poses.
            - Landscape: Natural scenes, wide vistas, and detailed environments.
            - Samurai: Feudal Japan, warriors, and traditional elements.
          `,
        });



        async function tokenDeduct(aspectRatio, theme, numberOfImages) {
            // Fetch the user's token balance from the database
            const userDoc = await db.collection("users").doc(localStorage.getItem("ElixpoAIUser")).get();
            let tokens = userDoc.data().coins;
            
            let aspectRatioMultiplier;
            let themeMultiplier;
            let baseCostPerImage = 1000; // Base cost per image
        
            // Define aspect ratio multipliers
            switch (aspectRatio) {
                case '1:1':
                    aspectRatioMultiplier = 1.0;
                    break;
                case '9:16':
                    aspectRatioMultiplier = 1.2;
                    break;
                case '16:9':
                    aspectRatioMultiplier = 1.1;
                    break;
                case '4:3':
                    aspectRatioMultiplier = 1.3;
                    break;
                case '3:2':
                    aspectRatioMultiplier = 1.4;
                    break;
                default:
                    aspectRatioMultiplier = 1.0; // Default multiplier
            }
        
            // Define theme multipliers
            switch (theme) {
                case 'Fantasy':
                    themeMultiplier = 1.5;
                    break;
                case 'Halloween':
                    themeMultiplier = 1.4;
                    break;
                case 'Euphoric':
                    themeMultiplier = 1.3;
                    break;
                case 'Crayon':
                    themeMultiplier = 1.2;
                    break;
                case 'Space':
                    themeMultiplier = 1.6;
                    break;
                case 'Chromatic':
                    themeMultiplier = 1.7;
                    break;
                case 'Cyberpunk':
                    themeMultiplier = 1.8;
                    break;
                case 'Anime':
                    themeMultiplier = 1.5;
                    break;
                case 'Landscape':
                    themeMultiplier = 1.2;
                    break;
                case 'Samurai':
                    themeMultiplier = 1.6;
                    break;
                case 'Wpap':
                    themeMultiplier = 1.3;
                    break;
                case 'Vintage':
                    themeMultiplier = 1.4;
                    break;
                case 'Pixel':
                    themeMultiplier = 1.2;
                    break;
                case 'Normal':
                    themeMultiplier = 1.0;
                    break;
                case 'Synthwave':
                    themeMultiplier = 1.5;
                    break;
                default:
                    themeMultiplier = 1.0; // Default multiplier
            }
        
            // Calculate total cost
            let totalCost = baseCostPerImage * aspectRatioMultiplier * themeMultiplier * numberOfImages;
        
            // Deduct tokens
            tokens -= totalCost;
            await db.collection("users").doc(localStorage.getItem("ElixpoAIUser")).update({
                coins: tokens,
            });
        
            console.log("Total Cost:", totalCost);
            return totalCost;
        }
        

            tokenDeduct("1:1", "Fantasy", 1);


        async function generateImageAsync(prompt, width, height, seed, aspectRatio, theme, genNumber, controller) {
            document.getElementById("NotifTxt").innerText = "Generating Images...";
            document.getElementById("savedMsg").classList.add("display");
            const model = Math.random() < 0.5 ? "flux" : "boltning";
            // const model = "boltning";
            const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=1`;
        
            const imageTile = document.querySelector(".imageTile" + genNumber);
            imageTile.classList.add("generating");
            specialDir = localStorage.getItem("ElixpoAIUser") + "_" + Date.now();
            document.getElementById("generationTimeMask" + genNumber).style.animation = "loadingFlash 2s linear infinite";
            document.getElementById("generatedSeedIcon" + genNumber).style.animation = "loadingFlash 2s linear infinite";
            document.getElementById("generatedSeedIcon" + genNumber).style.color = "#00ff73";
        
            const startTime = Date.now();
        
            try {
                // const serverResponse = await fetch('./server.json'); // Ensure this path is correct relative to your HTML file
                // const serverData = await serverResponse.json();
                // const downloadUrl = serverData.servers.server1;
        
                return new Promise(async (resolve, reject) => {
                    const imgElement = document.getElementById("imageRecieve" + genNumber);
        
                    if (!imgElement) {
                        reject(`Element with ID "imageRecieve${genNumber}" not found.`);
                        return;
                    }
                    console.log(downloadUrl);
                    try {
                        
                        const response = await fetch(`${downloadUrl}/download-image`, {  //get image
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ imageUrl }),
                            signal: controller.signal
                        });
        
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        }
        
                        const data = await response.json();
                        const base64 = data.base64;
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
                        console.error('Error fetching image:', error);
                        if (error.message.includes('Failed to fetch')) {
                            document.getElementById("NotifTxt").innerText = "Server Offline!";
                            document.getElementById("savedMsg").classList.add("display");
                            setTimeout(() => {
                                document.getElementById("savedMsg").classList.remove("display");
                            }, 1500);
                            document.getElementById("NotifTxt").innerText = "Greetings";
                            handleStaticModeExclusive(currentIndex + 1);
                            reject(new Error('Node.js server is not running.'));
                        } else {
                            reject(error);
                        }
                    }
                });
            } catch (error) {
                console.error('Error fetching server URL:', error);
                document.getElementById("NotifTxt").innerText = "Error fetching server URL";
                document.getElementById("savedMsg").classList.add("display");
                setTimeout(() => {
                    document.getElementById("savedMsg").classList.remove("display");
                }, 1500);
                document.getElementById("NotifTxt").innerText = "Greetings";
            }
        }
        






       
        
        
        // Example usage

        
// Function to generate multiple images in parallel
async function generateMultipleImages(encodedPrompt, width, height, seeds, aspectRatio, theme, numberOfImages, controller) {
    const promises = [];

    for (let i = 0; i < numberOfImages; i++) {
        const genNumber = (i + 1).toString();
        promises.push(generateImageAsync(encodedPrompt, width, height, seeds[i], aspectRatio, theme, genNumber, controller));
    }

    try {
        await Promise.all(promises);
        console.log("All images generated successfully.");
        generating = false;
        tokenDeduct(aspectRatio, theme, numberOfImages);
        document.getElementById("rejectBtn").classList.remove("hidden");
        if (document.getElementById("privateSwitch").checked == false) {
            document.getElementById("acceptBtn").classList.add("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings - (Private Result)";
            setTimeout(() => {
                document.getElementById("savedMsg").classList.remove("display"); 
            }, 1500);
            document.getElementById("enhancementAI").classList.add("hidden");
            document.getElementById("stopGeneration").classList.add("hidden");
            document.getElementById("NotifTxt").innerText = "Greetings!";
        } else {
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
    document.getElementById("aspectRatioControls").classList.remove("hidden");
    document.getElementById("aiEnhancementDesc").classList.remove("hidden");
    document.getElementById("privatePublicResultDesc").classList.remove("hidden");
    document.getElementById("privateResultSection").classList.remove("hidden");
    document.getElementById("enhanceButton").classList.remove("hidden");
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
    document.getElementById("savedMsg").classList.remove("display");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("hqlqcontainer").classList.remove("hidden");
    document.getElementById("statusImage").innerHTML = "";
    
    specialDir = "";
    encodedPrompt = "";
    },1500)
    
}


document.getElementById("rejectBtn").addEventListener("click", () => {
    handleStaticModeExclusive(currentIndex+1);
});

document.getElementById("acceptBtn").addEventListener("click", () => {
    handleStaticServerUpload(blobs, blobs.length, imageVarType, specialDir ,0);
});



async function gettotalGenOnServer() {
    const snapshot = await db.collection('Server').doc("totalGen").get();
    console.log("Total Gen:", snapshot.data().value);
    let totalGen = parseInt(snapshot.data().value);
    return totalGen;
}

async function fetchFormattedPrompt(prompt) {
     formatted_prompt = "";
     hashtags = "";
     tags = "";
    try {
        const response = await fetch(`${tagUrl}/tag_gen`, { //python endpoint -- tags generator
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: prompt }),
        });
  
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const data = await response.json();
        formatted_prompt = data.formatted_prompt;
        hashtags = data.hashtags
        tags = data.tags;
        console.log(formatted_prompt, hashtags, tags);

        return [data.formatted_prompt, data.hashtags, data.tags];  // Return the markdown formatted prompt
    } catch (error) {
        console.error("Error fetching formatted prompt:", error);
        return "";
    }
    
}
// document.getElementById("serverStatus").addEventListener("click" ,async () => {
//     const [formatted_prompt, hashtags, tags] = await fetchFormattedPrompt("A small butterfly with an epic outline and glittery outlook");
    
// })


async function handleStaticServerUpload(blobs, imageNumber, imgTheme, specialDir, progress = 0) {
    generating = false;
    document.getElementById("NotifTxt").innerText = "Uploading Images...";
    document.getElementById("savedMsg").classList.add("display");
    document.getElementById("samplePrompt").classList.add("generated");
    document.getElementById("progressBar").classList.remove("zeroProgress");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("hqlqcontainer").classList.add("hidden");
    var currentTotalImageOnServer = await gettotalGenOnServer();
    console.log("Current Total Image on Server:", currentTotalImageOnServer);
    var nextImageNumber = currentTotalImageOnServer + 1;
    console.log("Next Image Number:", nextImageNumber);
    return new Promise(async (resolve, reject) => {
        try {

            const [formatted_prompt, hashtags, tags] = await fetchFormattedPrompt(promptTextInput.value);
            console.log("Updated with" + formatted_prompt, hashtags, tags);

            const storageRef = firebase.storage().ref();
            const timestamp = Date.now();
            const uploadPromises = [];

            if(enhanceSwitch.checked)
            {
                ai_enhanced_prompt = document.getElementById("enhancedPrompt").innerText;
            }


            // Prepare upload tasks for each blob
            blobs.forEach((blob, index) => {
                const imageRef = storageRef.child(`generatedImages/${imgTheme}/image_${timestamp}_${index}.png`);
                const uploadTask = imageRef.put(blob);

                // Track upload progress
                uploadTask.on('state_changed',
                    (snapshot) => {
                        // Upload progress
                        const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log(`Image ${index + 1} upload is ${currentProgress}% done`);
                    },
                    (error) => {
                        // Handle unsuccessful uploads
                        console.error(`Error during upload of image ${index + 1}:`, error);
                        reject(error);
                    },
                    async () => {
                        // Handle successful uploads
                        try {
                            const url = await imageRef.getDownloadURL();
                            console.log(`Download URL for image ${index + 1}:`, url);
                            
                            // Update Firestore with image metadata
                            await db.collection("ImageGen").doc(specialDir).set({
                                theme: imgTheme,
                                timestamp: timestamp,
                                user: localStorage.getItem("ElixpoAIUser"),
                                prompt: promptTextInput.value,
                                ratio: RatioValue,
                                ai_enhanced: enhanceSwitch.checked,
                                likes: 0,
                                total_gen_number: blobs.length,
                                genNum : nextImageNumber,
                                formatted_prompt: formatted_prompt,
                                tags: tags,       
                                hashtags: hashtags,
                                enhanced_prompt: ai_enhanced_prompt  
                            });
                            await db.collection("ImageGen").doc(specialDir).update({
                                [`Imgurl${index}`]: url,
                            })


                            progress += 1;
                            let prog = Math.round((progress / imageNumber) * 100);
                            document.getElementById("progressBarAccept").style.width = prog + "%";

                            // Check if all uploads are complete
                            if (progress === blobs.length) {
                                resolve(uploadPromises);
                                console.log("All images uploaded successfully.");
                                generating = false;
                                setTimeout(() => {
                                    document.getElementById("savedMsg").classList.remove("display");
                                    document.getElementById("NotifTxt").innerText = "Greetings";
                                }, 1500);
                                document.getElementById("progressBarAccept").style.width = 0 + "%";
                                document.getElementById("savedMsg").classList.add("display");
                                await db.collection("Server").doc("totalGen").update({
                                    value: nextImageNumber,
                                })
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
                            handleStaticMode(currentIndex+1);
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
    document.getElementById("aspectRatioControls").classList.remove("hidden");
    document.getElementById("aiEnhancementDesc").classList.remove("hidden");
    document.getElementById("privatePublicResultDesc").classList.remove("hidden");
    document.getElementById("privateResultSection").classList.remove("hidden");
    document.getElementById("enhanceButton").classList.remove("hidden");
    document.getElementById("enhancingMessage").classList.add("hidden");
    document.getElementById("enhancingMessage").classList.remove("noEnhancement");
    document.getElementById("enhancedPrompt").innerText = "";
    document.getElementById("enhancementAI").classList.add("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");
    document.getElementById("rejectBtn").classList.add("hidden");
    document.getElementById("acceptBtn").classList.add("hidden");
    document.querySelector(".progressBar").classList.add("zeroProgress");
    document.querySelector("."+imageVarType).style.opacity = "1";
    document.getElementById("hqlqcontainer").classList.remove("hidden");
    document.getElementById("statusImage").innerHTML = "";
    encodedPrompt = "";
    specialDir = "";
    },1500)
    
}


// Example of event listener setup (assuming it's triggered on button click)
document.getElementById("searchButtonText").addEventListener("click", async () => {
    console.log("Search Button Clicked");
    const promptTextInput = document.getElementById("promptTextInput");
    if (promptTextInput.value.trim() !== "") {
        // websiteStaticMode = "Generating";
        generatingModeHandle();
    } else {
        // Handle case when prompt input is empty
        document.getElementById("promptTextInput").setAttribute("placeholder", "Please Enter a Prompt to Generate an Image");
        setTimeout(() => {
            document.getElementById("promptTextInput").setAttribute("placeholder", "Type in Your Prompt for Elixpo to Imagine");
        }, 3000);
        document.getElementById("promptTextInput").focus();
    }
});

async function enhance(prompt) {
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";

    try {
        const model = await genAI.getGenerativeModel(modelConfig);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text(); // Await the text extraction

        setTimeout(() => {
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";
        }, 1200);
        return text;
    } catch (error) {
        document.getElementById("textLoadingAnim").style.opacity = "1"; // Ensure the loading animation is hidden in case of error
        setTimeout(() => {
            document.getElementById("textLoadingAnim1").style.opacity = "0";
            document.getElementById("textLoadingAnim2").style.opacity = "0";
            document.getElementById("textLoadingAnim3").style.opacity = "0";
        }, 1200);
        return prompt;
    }
}
 
async function generatingModeHandle() {
    generating = true;
    let enhancedPrompt = "";
    document.getElementById("samplePrompt").classList.add("generating");
    document.getElementById("samplePrompt").style.height = "60px";
    document.getElementById("typeOfImageTile").classList.add("hidden");
    document.getElementById("aspectRatioControls").classList.add("hidden");
    document.getElementById("imageTiles").classList.remove("hidden");
    document.getElementById("stopGeneration").classList.remove("hidden");
    document.getElementById("isoAIEnhancement").classList.add("hidden");

    const enhanceSwitch = document.getElementById("enhanceSwitch");

    if (!enhanceSwitch.checked) {
        document.getElementById("aiEnhancementDesc").classList.add("hidden");
        document.getElementById("privatePublicResultDesc").classList.add("hidden");
        document.getElementById("privateResultSection").classList.add("hidden");
        document.getElementById("enhanceButton").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.contains("hidden") ? null : document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancementAI").classList.remove("hidden");
        document.getElementById("isoAIEnhancement").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.add("noEnhancement");
        document.getElementById("enhancedPrompt").innerText = " Image(s) are being Generated -- Pls StandBy! ";
        document.getElementById("hqlqcontainer").classList.add("hidden");
    } else {
        document.getElementById("aiEnhancementDesc").classList.add("hidden");   
        document.getElementById("privatePublicResultDesc").classList.add("hidden");
        document.getElementById("privateResultSection").classList.add("hidden");
        document.getElementById("enhanceButton").classList.add("hidden");
        document.getElementById("enhancingMessage").classList.remove("hidden");
        document.getElementById("enhancementAI").classList.remove("hidden");
        document.getElementById("hqlqcontainer").classList.add("hidden");
        document.getElementById("isoAIEnhancement").classList.add("hidden");
    }

    const promptTextInput = document.getElementById("promptTextInput");
    let encodedPrompt = promptTextInput.value.trim() + " in the style of " + imageVarType;
    let width, height;

    const isHQorLQ = document.getElementById("hqlqParent").checked;
    console.log("image is being generated under " + isHQorLQ)
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
    document.getElementById("statusImage").innerHTML = isHQorLQ ? "Image Generation HQ" : "Image Generation  LQ";
    controller = new AbortController();

    try {
        

        if (enhanceSwitch.checked) {
            document.getElementById("textLoadingAnim1").style.opacity = "1";
            document.getElementById("textLoadingAnim2").style.opacity = "1";
            document.getElementById("textLoadingAnim3").style.opacity = "1";
            try {
                const response = await fetch(`${enhanceUrl}/enhance-prompt`, {  // pimp-prompt
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ prompt: encodedPrompt, seed: Math.random() * 1000000 })
                });

                if (!response.ok) {
                    document.getElementById("textLoadingAnim1").style.opacity = "0";
                    document.getElementById("textLoadingAnim2").style.opacity = "0";
                    document.getElementById("textLoadingAnim3").style.opacity = "0";
                    enhancedPrompt = encodedPrompt;
                    throw new Error('Failed to enhance prompt');
                }

                const data = await response.json();
                enhancedPrompt = data.enhancedPrompt;
                if (enhancedPrompt.includes("it doesn not mean anything")) {
                    handleStaticModeExclusive(currentIndex + 1);
                    document.getElementById("promptTextInput").setAttribute("placeholder", "Please Enter a Prompt to Generate an Image");
                    setTimeout(() => {
                        document.getElementById("promptTextInput").setAttribute("placeholder", "Type in Your Prompt for Elixpo to Imagine");
                    }, 3000);
                    document.getElementById("promptTextInput").focus();
                }

                setTimeout(() => {
                    document.getElementById("enhancedPrompt").innerText = enhancedPrompt;
                }, 1000);

                document.getElementById("textLoadingAnim1").style.opacity = "0";
                document.getElementById("textLoadingAnim2").style.opacity = "0";
                document.getElementById("textLoadingAnim3").style.opacity = "0";
                
                await generateMultipleImages(enhancedPrompt, width, height, seeds, RatioValue, imageVarType, numberOfImages, controller);
            } catch (error) {
                await generateMultipleImages(encodedPrompt, width, height, seeds, RatioValue, imageVarType, numberOfImages, controller);
            }
        } else {
            await generateMultipleImages(encodedPrompt, width, height, seeds, RatioValue, imageVarType, numberOfImages, controller);
        }
    } catch (error) {
        console.error('Error fetching server URL:', error);
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

    Array.from(children).forEach(child => {
        child.addEventListener('click', () => {
            imageVarType = child.className;
            console.log(imageVarType);
            Array.from(children).forEach(c => {
                c.style.opacity = ".25";
            });
            child.style.opacity = "1";
            document.getElementById("isoImageType").style.background = 'url("./CSS/IMAGES/THEMES/'+imageVarType.toLowerCase()+'.jpeg")';
            document.getElementById("isoImageType").style.backgroundSize = "cover";
            document.getElementById("isoImageType").style.backgroundPosition = "50% 30%";
            document.getElementById("themeNameIcon").innerHTML = imageVarType;
          
        });
        
    });
});


document.addEventListener('DOMContentLoaded', (event) => {
    const aspectRatioControls = document.getElementById('aspectRatioControls');
    const tiles = aspectRatioControls.getElementsByClassName('aspectRatioTile');
    
    // Set initial state
    const defaultTile = document.getElementById('aspectRatioTile1_1');
    defaultTile.classList.add('active');

    Array.from(tiles).forEach(tile => {
        tile.addEventListener('click', () => {
            // Remove active class from all tiles
            Array.from(tiles).forEach(t => {
                t.classList.remove('active');
                t.style.opacity = "0.25";
            });

            // Add active class to the clicked tile
            tile.classList.add('active');
            tile.style.opacity = "1";

            RatioValue = tile.querySelector('p').innerText;
            document.getElementById("selectedAspectRatio").innerText = RatioValue;
        });
    });
}); 



        diceIcon.addEventListener('click', () => {
            diceIcon.classList.add('click-effect');
            setTimeout(() => diceIcon.classList.remove('click-effect'), 200);

            diceIcon.classList.remove(diceClasses[currentIndex]);
            currentIndex = (currentIndex + 1) % diceClasses.length;
            diceIcon.classList.add(diceClasses[currentIndex]);
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


        document.querySelectorAll(".tile").forEach((tile, index) => {
            tile.addEventListener("click", () => {
                if (tile.classList.contains("expand")) {
                    document.getElementById("showImage").classList.remove("hidden");
                    const whichClick = index + 1;
                    expandImage(document.getElementById("maskImageTile" + whichClick).getAttribute("data-id"));
                }
            });
        })


document.getElementById("backButton").addEventListener("click" , () => {
    document.getElementById("showImage").classList.add("hidden");
})


function expandImage(enc) {
    document.getElementById("PromptDisplay").innerHTML = "";
   let encodedEnteries = enc.split("###");
    document.getElementById("showImage").classList.remove("hidden");
    document.getElementById("showImage").querySelector("img").src = encodedEnteries[0];
    // console.log(encodedEnteries[0]);
    document.getElementById("downloadBox").setAttribute("data-id", encodedEnteries[0]);
    setTimeout(() => {
        document.getElementById("imgDisp").classList.add("loaded");
    }, 1200);
    document.getElementById("PromptDisplay").innerHTML = `<pre><code>${encodedEnteries[1]}</code></pre>`;
    const user = encodedEnteries[2];
    const genNumber = encodedEnteries[3];
    // document.getElementById("singAcceptBtn").setAttribute("data-id", genNumber);
    document.getElementById("genUserName").innerText = user;
}


document.getElementById("downloadBox").addEventListener("click", (e) => {
    const downloadUrl = document.getElementById("downloadBox").getAttribute("data-id");

    uploadBlob(downloadUrl, fileName);
})


function downloadBlob(blob, fileName) {
    const ctx = canvas.getContext('2d');

    const url = blob;
    // console.log(url)
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
}

function uploadBlob(blob, fileName) {
    const watermarkImage = new Image();
    const watermarkImageInverted = new Image();
    watermarkImage.crossOrigin = "Anonymous";
    watermarkImageInverted.crossOrigin = "Anonymous";
    watermarkImage.src = "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20final.png?alt=media&token=4bdf46cb-c851-4638-a0ea-a2723c8d4038"
    watermarkImageInverted.src = "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/officialDisplayImages%2FOfficial%20Asset%20Store%2Fwatermark%20inverted%20final.png?alt=media&token=4a7b007d-e5dc-4b56-aa7f-acc6446b1bbe"

    const mainImage = new Image();
    const url = blob;
    mainImage.crossOrigin = "Anonymous";
    mainImage.src = url;
    mainImage.onload = () => {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions to match the main image
        canvas.width = mainImage.width;
        canvas.height = mainImage.height;

        // Draw the main image onto the canvas
        ctx.drawImage(mainImage, 0, 0);

        // Detect brightness in the bottom left corner
        const sampleSize = 10; // Size of the sample area
        const imageData = ctx.getImageData(0, canvas.height - sampleSize, sampleSize, sampleSize);
        let totalBrightness = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            // Calculate brightness using the formula
            totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
        }
        const averageBrightness = totalBrightness / (imageData.data.length / 4);

        // Choose the watermark based on the brightness
        const selectedWatermark = averageBrightness < 128 ? watermarkImageInverted : watermarkImage;

        selectedWatermark.onload = () => {
            // Define the position for the watermark
            const watermarkX = 10;
            const watermarkY = canvas.height - selectedWatermark.height - 10;

            const watermarkX_right = canvas.width - selectedWatermark.width - 10;
            const watermarkY_right = 10;

            // Draw the watermark onto the canvas
            ctx.drawImage(selectedWatermark, watermarkX, watermarkY);
            ctx.drawImage(selectedWatermark, watermarkX_right, watermarkY_right);
            console.log("modified");

            // Convert the canvas to a Blob and download it
            canvas.toBlob(function(modifiedBlob) {
                const downloadUrl = URL.createObjectURL(modifiedBlob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
            });
        };
    };

    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
}




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

document.getElementById("GalleryImageIcon").addEventListener("click", () => {
    if (generating) {
        alert("Image geneerating alredy, progress will  be lost")
        location.replace("gallery.html");
            
    }
    else 
    {
        location.replace("gallery.html");
    }
});

//commiting to pollinations right now
