
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
        document.getElementById("enhancingMessage").classList.remove("hidden"); 
        document.getElementById("NotifTxt").innerText = "Just 2 mins! Trying to understand the image!";
            document.getElementById("savedMsg").classList.add("display"); 
            controller = new AbortController();
        document.getElementById("textLoadingAnim1").style.opacity = "0";
        document.getElementById("textLoadingAnim2").style.opacity = "0";
        document.getElementById("textLoadingAnim3").style.opacity = "0";
        document.getElementById("enhancedPrompt").innerText = `Let's see what we can create from this image...`;
        try 
        {
          processedPrompt = await generatePromptFromImage(imageDataUrl, controller);
        }
        catch
        {
          if(controller.signal.aborted)
          {
            console.log("Image generation was aborted.");
            document.getElementById("enhancedPrompt").innerText = "Image generation was aborted.";
            document.getElementById("NotifTxt").innerText = "Image generation was aborted.";
            document.getElementById("savedMsg").classList.add("display");
            setTimeout(() => {
              document.getElementById("savedMsg").classList.remove("display");
            }, 1500);
            document.getElementById("NotifTxt").innerText = "Greetings";
            handleStaticMode(currentIndex + 1); 
            return;
          }
          else 
          {
            console.log("Error generating prompt from image.");
          document.getElementById("enhancedPrompt").innerText = "Error generating prompt from image.";
          document.getElementById("NotifTxt").innerText = "Error generating prompt from image.";
          document.getElementById("savedMsg").classList.add("display"); 
          setTimeout(() => {
            document.getElementById("savedMsg").classList.remove("display"); 
          }, 1500);
          document.getElementById("NotifTxt").innerText = "Greetings";
          handleStaticMode(currentIndex + 1);
          return;
          }
          
        }
       
        console.log(processedPrompt);
        document.getElementById("enhancedPrompt").innerText = processedPrompt;
        document.getElementById("savedMsg").classList.remove("display"); 
        document.getElementById("NotifTxt").innerText = "Greetings";

        if (enhanceMode) {
            enhancementProcessed = true;
            document.getElementById("aiEnhancementDesc").classList.add("hidden");
            document.getElementById("privatePublicResultDesc").classList.add("hidden");
            if (!document.getElementById("enhancingMessage").classList.contains("hidden")) {
                 
            }
            document.getElementById("enhancementAI").classList.remove("hidden");
            document.getElementById("isoAIEnhancement").classList.add("hidden");
            document.getElementById("enhancingMessage").classList.add("noEnhancement");
            document.getElementById("enhancingMessage").classList.remove("hidden");

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
        document.getElementById("enhancingMessage").classList.remove("hidden");
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
      document.getElementById("enhancingMessage").classList.remove("hidden");
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
    
    if(!controller)
    {
      controller = new AbortController();
    }
    

  
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
            cancelImageReference();
            handleStaticMode(currentIndex + 1);
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