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


const diceIcon = document.getElementById('OneImage');
const diceClasses = ['fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four'];


diceIcon.addEventListener('click', () => {
  diceIcon.classList.add('click-effect');
  setTimeout(() => diceIcon.classList.remove('click-effect'), 200);

  diceIcon.classList.remove(diceClasses[generationNumber - 1]);
  generationNumber = (generationNumber % diceClasses.length) + 1;
  diceIcon.classList.add(diceClasses[generationNumber - 1]);
});


document.getElementById("privateBtn").addEventListener("click", function() 
{
  privateMode = !privateMode;
  if (privateMode) {
    document.getElementById("privateBtn").classList.add("selected");
    notify("Images will be now private! No Server Inference");
  }
  else 
  {
    document.getElementById("privateBtn").classList.remove("selected");
  }
});
document.getElementById("pimpPrompt").addEventListener("click", function()
{
  enhanceMode = !enhanceMode;
  if (enhanceMode) {
    document.getElementById("pimpPrompt").classList.add("selected");
    notify("Pimped prompt mode enabled");
  }
  else 
  {
    document.getElementById("pimpPrompt").classList.remove("selected");
  }
});

document.querySelectorAll(".qualitySelection > .imageQuality").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".imageQuality").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    selectedImageQuality = this.getAttribute("data-quality");
  });
});

document.getElementById("promptIdea").addEventListener("click", function() {
  const randomIndex = Math.floor(Math.random() * prompts.length);
  document.getElementById("promptTextInput").value = prompts[randomIndex];
  const event = new Event("input", {bubbles: true});
  document.getElementById("promptTextInput").dispatchEvent(event);
  
});


let imageGeneratorTop = document.getElementById("imageCustomization").getBoundingClientRect().top - 60;
document.querySelector(".sectionContainer").scrollTo({ top: imageGeneratorTop});


document.querySelector(".sectionContainer").addEventListener("scroll", function(e) {
  e.preventDefault();
});



function notify(msg, persist = false) {
  const notif = document.getElementById("notification");
  const notifText = document.getElementById("notifText");

  notifText.innerText = msg;
  notif.classList.add("display");

  // If not persistent, auto-remove after 3 seconds
  if (!persist) {
      setTimeout(() => {
          notif.classList.remove("display");
      }, 3000);
  }
}
function dismissNotification() {
  document.getElementById("notification").classList.remove("display");
}



document.querySelectorAll(".themes").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".themes").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    imageTheme = this.getAttribute("data-theme");
    document.getElementById("themeShowCaseHolder").style.background = `url(../../CSS/IMAGES/PREVIEW_IMAGES/${this.getAttribute("data-theme")}_preview.JPG)`;
    document.getElementById("themeShowCaseHolder").style.backgroundSize = "cover";
  });
});

document.querySelectorAll(".ratios").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".ratios").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    ratio = this.getAttribute("data-ratio");
  });
});


document.querySelectorAll(".models").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".models").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    model = this.getAttribute("data-model");
  });
});




document.getElementById("promptTextInput").addEventListener("input", debounce(handleInput, 100));
document.getElementById("promptTextInput").addEventListener("keydown", debounce(handleInput, 100));
document.getElementById("promptTextInput").addEventListener("load", debounce(handleInput, 100));

function handleInput() {
    const promptText = document.getElementById("promptTextInput").value;

    // Handle "--en"
    toggleClass(promptText.includes("--en"), "pimpPrompt", "selected");
    enhanceMode = promptText.includes("--en");

    // Handle "--pv"
    toggleClass(promptText.includes("--pv"), "privateBtn", "selected");
    privateMode = promptText.includes("--pv");

    // Handle quality selection
    const qualityMap = {
        "--ld": "qualitySelection_LD",
        "--sd": "qualitySelection_SD",
        "--hd": "qualitySelection_HD"
    };

    let selectedQuality = Object.keys(qualityMap).find(flag => promptText.includes(flag)) || "--sd";
    updateSelection(".imageQuality", qualityMap[selectedQuality]);

    // Handle aspect ratio selection (default: "4:3")
    handleSelection("--ar", ".aspectRatioTiles", "ratio", "4:3");

    // Handle theme selection (default: "normal")
    handleSelection("--th", ".themes", "theme", "normal");

    // Handle model selection (default: "core")
    handleSelection("--md", ".modelsTiles", "model", "core");
}

// Utility function to toggle class
function toggleClass(condition, elementId, className) {
    const element = document.getElementById(elementId);
    if (element) element.classList.toggle(className, condition);
}

// Utility function to update selection, applying a default if no match is found
function handleSelection(flag, selector, dataAttr, defaultValue) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => el.classList.remove("selected"));

    const match = document.getElementById("promptTextInput").value.match(new RegExp(`${flag}\\s([\\w-:]+)`));
    const selectedValue = match ? match[1] : defaultValue;

    const element = [...elements].find(el => el.dataset[dataAttr] === selectedValue);
    if (element) element.classList.add("selected");
}

// Utility function to update quality selection
function updateSelection(selector, selectedId) {
    document.querySelectorAll(selector).forEach(el => el.classList.remove("selected"));
    document.getElementById(selectedId).classList.add("selected");
}

// Debounce function to optimize input handling
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}


