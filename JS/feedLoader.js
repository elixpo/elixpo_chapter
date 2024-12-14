let imageCount = 0; // Counter for the number of images received
let imagesData = []; // Array to store all image data
const VISIBLE_IMAGE_COUNT = 30; // Number of images to keep in the DOM at any time
let isLoading = false; // Flag to prevent multiple simultaneous loads

// Function to render visible images only
function renderVisibleImages() {
  const feedImageWrapper = document.getElementById('feedImageWrapper');
  feedImageWrapper.innerHTML = ''; // Clear the container

  // Render only the most recent VISIBLE_IMAGE_COUNT images
  const startIndex = Math.max(0, imagesData.length - VISIBLE_IMAGE_COUNT);

  for (let i = startIndex; i < imagesData.length; i++) {
    const imageData = imagesData[i];
    let node = `
      <div class="feedContent">
        <img src="${imageData.imageURL}" class="loaded" />
        <div class="prompt">${imageData.prompt}</div>
      </div>
    `;
    feedImageWrapper.innerHTML += node;
  }
}

// Function to append new images to the data array
function appendImage(imageData) {
  imagesData.push(imageData);
  renderVisibleImages(); // Re-render to include new images
}

// Function to start listening for images
function startListening() {
  if (isLoading) return; // Prevent multiple simultaneous loads
  isLoading = true; // Set loading flag
  console.log("Loading more images...");
  document.getElementById("loadMore").classList.add("hidden");

  const eventSource = new EventSource('https://image.pollinations.ai/feed');

  eventSource.onmessage = function (event) {
    const imageData = JSON.parse(event.data);
    appendImage(imageData);
    imageCount++;

    // Stop listening after 15 images
    if (imageCount >= 15) {
      eventSource.close();
      document.getElementById("loadMore").classList.remove("hidden");
      isLoading = false; // Reset loading flag
    }
  };
}

// Attach the button click event listener
document.getElementById('loadMore').addEventListener('click', startListening);

// Initial image load when the page loads
startListening();

document.getElementById("homePage").addEventListener("click", function () { 
  redirectTo("");
});

document.getElementById("visitGallery").addEventListener("click", function () { 
  redirectTo("src/gallery");
});

document.getElementById("createArt").addEventListener("click", function () { 
  redirectTo("src/create");
});

document.getElementById("closeStream").addEventListener("click", function () { 
  redirectTo("src/feed");
});
