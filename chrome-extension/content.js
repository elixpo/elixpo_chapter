// Event listener for text selection
document.addEventListener('mouseup', (event) => {
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Check if the HTML structure already exists, if so, reposition it
      let generatingHolder = document.getElementById('generatingHolder');
      if (!generatingHolder) {
          // Create the HTML structure
          generatingHolder = document.createElement('div');
          generatingHolder.className = 'generatingHolder';
          generatingHolder.id = 'generatingHolder';

          generatingHolder.innerHTML = `
              <div id="star-icon">
                  <img src="${chrome.runtime.getURL('shines.png')}" alt="star">
              </div>
             <div class="imageGenerationHolder hidden" id="imageGenerationHolder">
        <div class="imageHolder">
            <img class="displayedImage" src="" id="displayedImage">
            <div class="imageLoadingAnimation hidden"></div>
        </div>
        <p class="selectedText">Lorem ipsum dolor sit amet consectetur adipisicing elit. </p>
        <button class="downloadButton">
            <div class="button-overlay"></div>
            <span>Download</span>
            
          </button>
          <button class="closeButton">
            <div class="button-overlay"></div>
            <span>Close</span>  
          </button>
          <ion-icon name="reload" class="reTry"></ion-icon>
    </div>
          `;

          document.body.appendChild(generatingHolder);

          // Add functionality to the Close button
          const closeButton = generatingHolder.querySelector('.closeButton');
          closeButton.addEventListener('click', () => {
              generatingHolder.style.display = 'none';
          });
      }

      // Update the position of the generatingHolder
      generatingHolder.style.position = 'absolute';
      generatingHolder.style.left = `${rect.left + window.scrollX}px`;
      generatingHolder.style.top = `${rect.top + window.scrollY + 50}px`; // Adjust position

      // Update the selected text
      const selectedTextElement = generatingHolder.querySelector('.selectedText');
      selectedTextElement.textContent = selection.toString().trim();

      // Make the container visible
      generatingHolder.style.display = 'block';
  } else {
      // Hide the container if no text is selected
      const generatingHolder = document.getElementById('generatingHolder');
      if (generatingHolder) {
          generatingHolder.style.display = 'none';
      }
  }

  document.getElementById("star-icon").addEventListener("click", () => {
    document.getElementById("imageGenerationHolder").classList.remove("hidden");
  })

  
});

// // Optional: Hide the generatingHolder if clicked outside
// document.addEventListener('click', (event) => {
//   const generatingHolder = document.getElementById('generatingHolder');
//   if (
//       generatingHolder &&
//       !generatingHolder.contains(event.target) &&
//       !window.getSelection().toString().trim()
//   ) {
//       generatingHolder.style.display = 'none';
//   }
// });

