let selectionLock = false;
let typingTimeout;
let themeDiv = null;
let themeText = null;
const themes = ["Normal", "Chromatic", "Wpap", "Landscape", "Anime", "Pixel"];
const aspectRatios = ["1:1", "4:3", "16:9", "9:16"];
let selectedAspectRatio = "1:1";
let selectedTheme = "Normal";
let selectedText = "";
let shineButton = null;
let wrapperCreated = false;
// Flag to ensure we only add the animation style to the page once
let animationStyleAdded = false; 

document.addEventListener("mouseup", function (event) {
  if (wrapperCreated) {
    return;
  }
  let selection = window.getSelection();
  selectedText = selection.toString().trim();
  setTimeout(() => {
    if (selection.toString().trim() == "") {
      if (document.querySelector(".shine-button")) {
        document.querySelector(".shine-button").remove();
        shineButton = null;
      }
      selectionLock = false;
      return;
    }
  }, 200);

  if (selectionLock) {
    return;
  }
  
  if (selection.rangeCount === 0) {
    return;
  }

  let range = selection.getRangeAt(0);
  selectedText = selection.toString().trim();

  if (selectedText) {
    selectionLock = true;

    removeShineButton();
    shineButton = document.createElement("button");
    shineButton.classList.add("shine-button");
    let shineImage = document.createElement("img");
    shineImage.src = chrome.runtime.getURL("assests/shines_thumbnail.png");
    shineImage.alt = "Generate with Shines";
    shineButton.appendChild(shineImage);

    Object.assign(shineButton.style, {
      position: "absolute",
      padding: "5px",
      height: "40px",
      width: "45px",
      zIndex: "10001",
      background: "linear-gradient(135deg, #2a0038, #4b0082)", // Deep purple gradient
      border: "none",
      cursor: "pointer",
      borderRadius: "15px",
      opacity: "1",
      transition: "opacity 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
      display: "flex",
      justifyContent: "center",
      transform: "scale(0.8)",
      alignItems: "center",
      boxShadow: "inset 4px 4px 6px rgba(0, 0, 0, 0.8), inset -4px -4px 6px rgba(144, 0, 255, 0.3)", // Purple glow inset
    });

    Object.assign(shineImage.style, {
      width: "24px",
      height: "24px",
    });

    let rect = range.getBoundingClientRect(); //Get bounding rectangle
    shineButton.style.left = `${rect.left + window.scrollX - shineButton.offsetWidth - 10}px`; // Position just to the left of the selection
    shineButton.style.top = `${rect.top + window.scrollY - 45}px`; // Adjust vertical position

    shineButton.addEventListener("click", function () {
      wrapperCreated = true;

      let node = document.createElement("div");
      node.classList.add("elixpo-wrapper");

      // Create the HTML structure using innerHTML for brevity
      node.innerHTML = `
                <div class="content-container">
                    <div class="pic-container" id="picContainer">
                        <div class="loader" id="loader"></div>
                    </div>
                    <div class="controls-container">
                        <div class="themeContainer"></div>
                        <div class="aspect-container"></div>
                    </div>
                </div>
                <div class="promptcontrol">
                    <svg id="closePopup" class="ionicon" viewBox="0 0 512 512" width="24" height="24">
                        <path d="M289.94 256l95-95A24 24 0 00351 127l-95 95-95-95a24 24 0 00-34 34l95 95-95 95a24 24 0 1034 34l95-95 95 95a24 24 0 0034-34z"></path>
                    </svg>
                    <input type="text" placeholder="Any Custom Instructions?" class="promptInstruction" id="promptInstruction" autocomplete="off" spellcheck="false">
                    <button class="generate-button" id="generateImage">
                        <svg class="ionicon" viewBox="0 0 512 512" width="24" height="24">
                            <path d="M208 512a24.84 24.84 0 01-23.34-16l-39.84-103.6a16.06 16.06 0 00-9.19-9.19L32 343.34a25 25 0 010-46.68l103.6-39.84a16.06 16.06 0 009.19-9.19L184.66 144a25 25 0 0146.68 0l39.84 103.6a16.06 16.06 0 009.19 9.19l103 39.63a25.49 25.49 0 0116.63 24.1 24.82 24.82 0 01-16 22.82l-103.6 39.84a16.06 16.06 0 00-9.19 9.19L231.34 496A24.84 24.84 0 01208 512zm66.85-254.84zM88 176a14.67 14.67 0 01-13.69-9.4l-16.86-43.84a7.28 7.28 0 00-4.21-4.21L9.4 101.69a14.67 14.67 0 010-27.38l43.84-16.86a7.31 7.31 0 004.21-4.21L74.16 9.79A15 15 0 0186.23.11a14.67 14.67 0 0115.46 9.29l16.86 43.84a7.31 7.31 0 004.21 4.21l43.84 16.86a14.67 14.67 0 010 27.38l-43.84 16.86a7.28 7.28 0 00-4.21 4.21l-16.86 43.84A14.67 14.67 0 0188 176zM400 256a16 16 0 01-14.93-10.26l-22.84-59.37a8 8 0 00-4.6-4.6l-59.37-22.84a16 16 0 010-29.86l59.37-22.84a8 8 0 004.6-4.6l22.67-58.95a16.45 16.45 0 0113.17-10.57 16 16 0 0116.86 10.15l22.84 59.37a8 8 0 004.6 4.6l59.37 22.84a16 16 0 010 29.86l-59.37 22.84a8 8 0 00-4.6 4.6l-22.84 59.37A16 16 0 01400 256z"></path>
                        </svg>
                    </button>
                    <button class="downloadBtn" id="downloadBtn">
                        <svg class="ionicon" viewBox="0 0 512 512" width="24" height="24">
                            <path d="M376 160H272v153.37l52.69-52.68a16 16 0 0122.62 22.62l-80 80a16 16 0 01-22.62 0l-80-80a16 16 0 0122.62-22.62L240 313.37V160H136a56.06 56.06 0 00-56 56v208a56.06 56.06 0 0056 56h240a56.06 56.06 0 0056-56V216a56.06 56.06 0 00-56-56zM272 48a16 16 0 00-32 0v112h32z"></path>
                        </svg>
                    </button>
                </div>
                <p class="pimp-text" id="pimpText"></p>
            `;

      let contentContainer = node.querySelector(".content-container");
      let picContainer = node.querySelector("#picContainer");
      let loaderDiv = node.querySelector("#loader");
      let controlsContainer = node.querySelector(".controls-container");
      let themeContainer = node.querySelector(".themeContainer");
      let aspectContainer = node.querySelector(".aspect-container");
      let promptcontrol = node.querySelector(".promptcontrol");
      let textBox = node.querySelector("#promptInstruction");
      let generateButton = node.querySelector("#generateImage");
      let downloadButton = node.querySelector("#downloadBtn");
      let closeIcon = node.querySelector("#closePopup");
      let pimpText = node.querySelector("#pimpText");

      for (let i = 0; i < themes.length; i++) {
        let themeDiv = document.createElement("div");
        themeDiv.classList.add("theme-item");
        if (i === 0) themeDiv.classList.add("selected");
        themeDiv.innerHTML = `<p>${themes[i]}</p>`;
        themeContainer.appendChild(themeDiv);

        Object.assign(themeDiv.style, {
          backgroundImage: `url('${chrome.runtime.getURL(`assests/${i}.jpeg`)}')`,
          backgroundSize: "cover",
          width: "calc(50% - 10px)",
          maxWidth: "150px",
          aspectRatio: "1 / 1",
          borderRadius: "15px",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: "0.35",
          transition: "opacity 0.3s ease",
        });

        let themeText = themeDiv.querySelector("p");
        Object.assign(themeText.style, {
          position: "absolute",
          bottom: "5px",
          left: "50%",
          transform: "translateX(-50%)",
          margin: "0",
          color: "white",
          background: "rgba(8, 8, 8, 0.58)",
          fontSize: "0.7em",
          backdropFilter: "blur(2px)",
          fontFamily: "'Source Code Pro', monospace",
          padding: "5px",
          boxSizing: "border-box",
        });

        themeDiv.addEventListener("mouseover", function () {
          this.style.opacity = "1";
        });
        themeDiv.addEventListener("mouseleave", function () {
          if (!this.classList.contains("selected")) this.style.opacity = "0.35";
        });
        themeDiv.addEventListener("click", function () {
          document.querySelectorAll(".theme-item").forEach((item) => {
            item.classList.remove("selected");
            item.style.opacity = "0.35";
          });
          this.classList.add("selected");
          this.style.opacity = "1";
          selectedTheme = themes[i];
        });
      }

      for (let i = 0; i < aspectRatios.length; i++) {
        let aspectDiv = document.createElement("div");
        aspectDiv.classList.add("aspect-item");
        if (i === 0) aspectDiv.classList.add("selected");
        aspectDiv.textContent = aspectRatios[i];
        aspectContainer.appendChild(aspectDiv);

        Object.assign(aspectDiv.style, {
          padding: "10px",
          borderRadius: "5px",
          background: i === 0 ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.1)",
          cursor: "pointer",
          transition: "background 0.3s ease",
          textAlign: "center",
          flex: "1",
        });

        aspectDiv.addEventListener("mouseover", function () {
          if (!this.classList.contains("selected")) this.style.background = "rgba(255, 255, 255, 0.2)";
        });
        aspectDiv.addEventListener("mouseout", function () {
          if (!this.classList.contains("selected")) this.style.background = "rgba(255, 255, 255, 0.1)";
        });
        aspectDiv.addEventListener("click", function () {
          document.querySelectorAll(".aspect-item").forEach((item) => {
            item.classList.remove("selected");
            item.style.background = "rgba(255, 255, 255, 0.1)";
          });
          this.classList.add("selected");
          this.style.background = "rgba(255, 255, 255, 0.3)";
          selectedAspectRatio = this.textContent;
        });
      }

      Object.assign(node.style, {
        width: "70%",
        borderRadius: "8px",
        background: "rgba(22, 21, 21, 0.89)",
        backdropFilter: "blur(10px)",
        margin: "10px auto",
        maxWidth: "800px",
        zIndex: "10000",
        border: "3px solid rgb(255, 208, 0)",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      });

      Object.assign(contentContainer.style, {
        display: "flex",
        width: "100%",
        height: "300px",
      });

      Object.assign(picContainer.style, {
        width: "60%",
        height: "100%",
        borderRadius: "8px",
        background: "#111",
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
        marginRight: "10px",
        boxSizing: "border-box",
      });

      Object.assign(loaderDiv.style, {
        height: "100%",
        width: "100%",
        background: "linear-gradient(35deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff)",
        backgroundSize: "300% 300%",
        backgroundPosition: "0% 50%",
        zIndex: "100",
        filter: "blur(20px)",
        animation: "backgroundShift 8s ease-in-out infinite alternate",
        transition: "0.25s",
        opacity: "0",
      });

      Object.assign(controlsContainer.style, {
        width: "40%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        boxSizing: "border-box",
      });

      Object.assign(themeContainer.style, {
        width: "100%",
        height: "75%",
        padding: "10px",
        boxSizing: "border-box",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "20px",
        overflowY: "auto",
        position: "relative",
        background: "transparent",
        scrollBehavior: "smooth",
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
      });

      Object.assign(aspectContainer.style, {
        width: "95%",
        height: "25%",
        display: "flex",
        gap: "10px",
        background: "transparent",
        overflow: "hidden",
        overflowX: "auto",
        padding: "10px",
        fontSize: "1em",
        boxSizing: "border-box",
        color: "#fff",
        alignItems: "center",
        justifyContent: "space-evenly",
        fontFamily: "'Kanit', sans-serif",
        fontWeight: "bold",
        scrollBehavior: "smooth",
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
      });

      Object.assign(promptcontrol.style, {
        width: "95%",
        marginTop: "10px",
        display: "flex",
        justifyContent: "center",
        gap: "10px",
        padding: "10px",
        background: "transparent",
        height: "60px",
        boxSizing: "border-box",
      });

      Object.assign(textBox.style, {
        width: "60%",
        height: "45px",
        borderRadius: "5px",
        textIndent: "10px",
        paddingRight: "10px",
        border: "none",
        background: "transparent",
        padding: "10px",
        color: "#fff",
        fontSize: "0.8em",
        boxSizing: "border-box",
        outline: "none",
        fontFamily: "'Source Code Pro', monospace",
        fontWeight: "400",
        textAlign: "left",
        border: "2px solid rgb(222, 146, 14)",
        marginBottom: "15px",
      });

      Object.assign(generateButton.style, {
        width: "45px",
        height: "45px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "8px",
        border: "none",
        background: "rgb(255, 208, 0)",
        cursor: "pointer",
        transition: "0.3s",
      });

      Object.assign(generateButton.querySelector("svg").style, {
        fontSize: "24px",
        fill: "black",
        transform: "rotate(90deg)",
      });

      Object.assign(downloadButton.style, {
        width: "85px",
        height: "45px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "8px",
        border: "none",
        background: "rgb(6, 212, 109)",
        cursor: "pointer",
        transition: "0.3s",
        opacity: "0",
        pointerEvents: "none",
      });

      Object.assign(downloadButton.querySelector("svg").style, {
        fill: "black",
        transform: "rotate(0deg)",
      });

      Object.assign(closeIcon.style, {
        width: "40px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        transition: "0.3s",
        marginRight: "30px",
      });

      Object.assign(closeIcon.querySelector("path").style, {
        fill: "red",
      });

      Object.assign(pimpText.style, {
        color: "#999",
        opacity: "0.5",
        position: "relative",
        marginTop: "15px",
        textAlign: "justify",
        fontSize: "0.8em",
        fontFamily: "'Kanit', sans-serif",
        fontWeight: "bold",
        alignSelf: "flex-start",
        maxWidth: "85%",
        maxHeight: "80px",
        overflow: "hidden",
        marginLeft: "10px",
        textOverflow: "ellipsis",
        overflowY: "auto",
        paddingLeft: "15px",
        borderLeft: "5px solid rgb(255, 208, 0)",
        scrollBehavior: "smooth",
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
      });

      // ** THE FIX IS HERE **
      // This new block safely creates a <style> tag for the animation,
      // preventing the security error on certain websites.
      if (!animationStyleAdded) {
        const style = document.createElement('style');
        style.textContent = `
          @keyframes backgroundShift {
            0% { background-position: 0% 50%; }
            25% { background-position: 50% 50%; }
            50% { background-position: 100% 50%; }
            75% { background-position: 50% 50%; }
            100% { background-position: 0% 50%; }
          }
        `;
        document.head.appendChild(style);
        animationStyleAdded = true; // Set flag to prevent adding it again
      }

      // Event listeners
      closeIcon.onclick = function () {
        node.style.transition = "opacity 0.5s ease-out";
        node.style.opacity = "0";
        setTimeout(() => {
          node.remove();
        }, 500);
        selectionLock = false;
        wrapperCreated = false;
        removeShineButton();
      };

      textBox.style.setProperty("--placeholder-color", "rgba(255, 255, 255, 0.97)");
      textBox.addEventListener("input", function () {
        if (this.value.length > 0) {
          this.style.textAlign = "left";
        } else {
          this.style.textAlign = "left";
        }
      });

      let container = range.startContainer;
      while (container.nodeType !== 1) {
        container = container.parentNode;
      }
      container.parentNode.insertBefore(node, container.nextSibling);

      document.getElementById("generateImage").addEventListener("click", () => {
        generateImage();
      });
      document.getElementById("downloadBtn").addEventListener("click", () => {
        downloadImage();
      });
      type(
        `This is what you have selected haa? ..." ${selectedText} " \n Well Select any theme and aspect-ratio and HIT that generate button `
      );

      window.getSelection().removeAllRanges();
      removeShineButton();
    });

    document.body.appendChild(shineButton);
  } else {
    removeShineButton();
    selectionLock = false;
  }
});

function removeShineButton() {
  if (document.querySelector(".shine-button")) {
    document.querySelector(".shine-button").remove();
    shineButton = null;
  }
}

function type(text) {
  let element = document.getElementById("pimpText");
  element.textContent = "";
  let index = 0;

  function typeChar() {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
      typingTimeout = requestAnimationFrame(typeChar);
    }
  }

  cancelAnimationFrame(typingTimeout);
  typeChar();
}

// --- NEW CODE for handling the "Reimagine" feature ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REIMAGINE_IMAGE" && message.imageUrl) {
    const existingWrapper = document.querySelector(".elixpo-wrapper");
    if (existingWrapper) {
      existingWrapper.remove();
    }
    
    displayReimaginedImage(message.imageUrl);
  }
});

function displayReimaginedImage(imageUrl) {
  wrapperCreated = true;
  removeShineButton();

  let node = document.createElement("div");
  node.classList.add("elixpo-wrapper");

  node.innerHTML = `
      <div class="promptcontrol" style="width: 100%; justify-content: flex-end; padding: 0; margin-bottom: 10px;">
          <svg id="closePopup" class="ionicon" viewBox="0 0 512 512" width="24" height="24" style="cursor: pointer;">
              <path d="M289.94 256l95-95A24 24 0 00351 127l-95 95-95-95a24 24 0 00-34 34l95 95-95 95a24 24 0 1034 34l95-95 95 95a24 24 0 0034-34z" fill="red"></path>
          </svg>
      </div>
      <div class="pic-container" id="picContainer" style="width:100%; height: 400px; background-color: #111; border-radius: 8px;"></div>
      <div class="promptcontrol" style="width: 100%; justify-content: center; padding: 0; margin-top: 10px;">
          <button class="downloadBtn" id="downloadBtn" style="opacity: 1; pointer-events: all; width: 120px; height: 45px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: rgb(6, 212, 109); cursor: pointer;">
              Download
              <svg class="ionicon" viewBox="0 0 512 512" width="20" height="20" style="margin-left: 8px;">
                  <path d="M376 160H272v153.37l52.69-52.68a16 16 0 0122.62 22.62l-80 80a16 16 0 01-22.62 0l-80-80a16 16 0 0122.62-22.62L240 313.37V160H136a56.06 56.06 0 00-56 56v208a56.06 56.06 0 0056 56h240a56.06 56.06 0 0056-56V216a56.06 56.06 0 00-56-56zM272 48a16 16 0 00-32 0v112h32z" fill="black"></path>
              </svg>
          </button>
      </div>
  `;

  Object.assign(node.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: "90%",
    maxWidth: "500px",
    borderRadius: "8px",
    background: "rgba(22, 21, 21, 0.95)",
    backdropFilter: "blur(10px)",
    zIndex: "2147483647", // Max z-index
    border: "3px solid rgb(255, 208, 0)",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: 'border-box'
  });
  
  document.body.appendChild(node);
  
  const picContainer = node.querySelector("#picContainer");
  picContainer.style.backgroundImage = `url('${imageUrl}')`;
  picContainer.style.backgroundSize = "contain";
  picContainer.style.backgroundRepeat = "no-repeat";
  picContainer.style.backgroundPosition = "center";

  node.querySelector("#closePopup").onclick = () => { node.remove(); wrapperCreated = false; };
  node.querySelector("#downloadBtn").onclick = () => {
    if (typeof downloadImage === 'function') {
      const mainPicContainer = document.getElementById('picContainer') || picContainer;
      const originalBg = mainPicContainer.style.backgroundImage;
      mainPicContainer.style.backgroundImage = `url('${imageUrl}')`;
      downloadImage();
      mainPicContainer.style.backgroundImage = originalBg;
    }
  };
}