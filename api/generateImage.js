import dotenv from 'dotenv'
import fetch from 'node-fetch';

dotenv.config();

const POLLINATIONS_TOKEN = process.env.polli_token;

async function generateImageWorker(request) {
  const { prompt, width, height, model, seed, imageMode, uploadedUrl, privateMode } = request;
  
  let generateUrl;
  
  if (imageMode && uploadedUrl) {
    if (model === "kontext" || model === "nanobanana") {
      generateUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&image=[${uploadedUrl}]&nologo=true&token=${POLLINATIONS_TOKEN}`;
    } else {
      throw new Error("Image mode only supports kontext and nanobanana models");
    }
  } else {
    generateUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&nologo=true&referrer=elixpoart&token=${POLLINATIONS_TOKEN}&seed=${seed}`;
  }

  if (privateMode) {
    generateUrl += "&private=true";
  }

  // Implement retry logic with fallback
  const maxRetries = 3;
  let lastError;
  let currentUrl = generateUrl;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} for request ${request.id}: ${currentUrl}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      const response = await fetch(currentUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'ElixpoArt/1.0'
        }
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const imageBlob = await response.blob();
      
      // Return both the blob and the successful URL
      return {
        blob: imageBlob,
        originalUrl: currentUrl
      };
      
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed for request ${request.id}:`, error.message);
      
      // If nanobanana or kontext fails and not in imageMode, fallback to flux
      if ((model === 'nanobanana' || model === 'kontext') && !imageMode && attempt === 2) {
        currentUrl = currentUrl.replace(`model=${model}`, 'model=flux');
        console.log(`Falling back to flux model for request ${request.id}`);
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  throw lastError || new Error('Image generation failed after all retries');
}

export default generateImageWorker;