let cyclePlaceholderPrompts = null;
let placeholder_prompts = [
    "A panda wearing a space suit floating inside a zero-gravity spaceship.",
    "--pr a knight in shining armor riding a cybernetic horse, wielding a plasma sword --ar 4:3 --ld epic --hd --th structure",
    "A wizard casting a spell in a library where books are flying around like birds.",
    "--pr a samurai standing in a field of glowing cherry blossoms, under a blood-red moon --ar 3:2 --ld dramatic --hd --th ghibli",
    "A dragon curled around a skyscraper breathing blue fire into the night sky.",
    "--pr a futuristic city floating above the clouds, with neon lights reflecting on glass buildings --ar 16:9 --ld cinematic --hd --th cyberpunk",
    "A cowboy riding a robotic horse through a cyberpunk city with neon signs flashing around.",
    "--pr a pirate ship sailing through the sky, with sails made of stardust --ar 9:16 --ld adventure --hd --th fantasy",
    "A Viking warrior standing on an iceberg staring at the northern lights.",
    "--pr a robot bartender mixing colorful drinks in a futuristic cyberpunk bar --ar 1:1 --ld cyberpunk --hd --th neon",
    "An enchanted forest where trees glow with bioluminescent colors and fairies fly around.",
    "--pr a dragon curled around a skyscraper, breathing blue fire into the night sky --ar 16:9 --ld fantasy --hd --th mythic",
    "A cat wearing a detective hat examining a mysterious glowing footprint.",
    "--pr a wizard casting a spell in a library where books are flying around like birds --ar 4:3 --ld whimsical --hd --th magical realism",
    "An eagle wearing sunglasses flying over a desert with a map in its talons.",
    "--pr a cowboy riding a robotic horse through a cyberpunk city, with neon signs flashing around --ar 16:9 --ld western --hd --th tech-noir",
    "A giant octopus playing a grand piano underwater surrounded by glowing fish.",
    "--pr an astronaut playing chess with an alien on the surface of Mars --ar 3:2 --ld surreal --hd --th space",
    "A pirate ship sailing through the sky with sails made of stardust.",
    "--pr a panda wearing a space suit, floating inside a zero-gravity spaceship --ar 9:16 --ld futuristic --hd --th cyberpunk",
    "A samurai standing in a field of glowing cherry blossoms under a blood-red moon.",
    "--pr an eagle wearing sunglasses, flying over a desert with a map in its talons --ar 3:2 --ld cinematic --hd --th adventure",
    "An enchanted forest where trees glow with bioluminescent colors and fairies fly around.",
    "--pr a giant octopus playing a grand piano underwater, surrounded by glowing fish --ar 9:16 --ld surreal --hd --th deep-sea",
    "A knight in shining armor riding a cybernetic horse wielding a plasma sword.",
    "--pr a Viking warrior standing on an iceberg, staring at the northern lights --ar 16:9 --ld epic --hd --th historical fantasy",
    "A futuristic city floating above the clouds with neon lights reflecting on glass buildings."
];


function typeWelcomeWord(msg, wordIndex = 0, callback) {
    const welcomeMessage = document.getElementById("welcomeMessage");
    const message = msg;
    const words = message.split(" ");
    
    if (wordIndex < words.length) {
        const span = document.createElement("span");
        span.textContent = words[wordIndex] + " ";
        span.style.opacity = 0;
        span.style.transition = "opacity 0.5s ease-in";
        welcomeMessage.appendChild(span);

        setTimeout(() => {
            span.style.opacity = 1;
        }, 100);

        setTimeout(() => typeWelcomeWord(msg, wordIndex + 1, callback), 200);
    } else if (callback) {
        callback();
    }
}



function typeDescWord(msg, wordIndex = 0, callback) {
    const welcomeMessage = document.getElementById("descMessage");
    const message = msg;
    const words = message.split(" ");
    
    if (wordIndex < words.length) {
        const span = document.createElement("span");
        span.textContent = words[wordIndex] + " ";
        span.style.opacity = 0;
        span.style.transition = "opacity 0.5s ease-in";
        welcomeMessage.appendChild(span);

        setTimeout(() => {
            span.style.opacity = 1;
        }, 100);

        setTimeout(() => typeDescWord(msg, wordIndex + 1, callback), 200);
    } else if (callback) {
        callback();
    }
}


typeWelcomeWord("Hey Buddy, Good Evening!", 0, () => {
    typeDescWord("What's on your mind?", 0, () => {
        promptBoxAppear();
    })
    });

function promptBoxAppear() 
{
    document.getElementById("promptBox").classList.remove("hidden");
    let index = 0;
    document.getElementById("promptTextInput").setAttribute("placeholder", "Press TAB to Autocomplete .... Starting Prompt Cycle...");
    setTimeout(() => {
        cyclePlaceholderPrompts = setInterval(() => {
            document.getElementById("promptTextInput").setAttribute("placeholder", placeholder_prompts[index]);
            index = (index + 1) % placeholder_prompts.length; // Cycle through the prompts
        }, 2000);
        // document.getElementById("promptTextInput").focus();
    }, 1500);
    
}

document.getElementById("promptTextInput").addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        const promptTextInput = document.getElementById("promptTextInput");
        const placeholder = promptTextInput.getAttribute("placeholder");
        promptTextInput.value = placeholder;
    }
});
    
function startMorphing() {
    const textElements = document.querySelectorAll(".welcomeMessage span");

    textElements.forEach((element, index) => {
        let weight = Math.random() * (500 - 300) + 300; // Random starting weight (300 - 500)
        let width = Math.random() * (87.5 - 75) + 75; // Random starting width (75 - 87.5)
        let spacing = Math.random() * 2 - 1; // Random letter spacing (-1 to 1)
        let scale = Math.random() * 0.2 + 0.9; // Random scale (0.9 - 1.1)
        let increasing = Math.random() < 0.5; // Randomly start expanding or contracting

        function smoothMorph() {
            if (increasing) {
                weight += 2;
                width += 0.5;
                spacing += 0.1;
                scale += 0.005;
                if (weight >= 500 || width >= 87.5) increasing = false;
            } else {
                weight -= 2;
                width -= 0.5;
                spacing -= 0.1;
                scale -= 0.005;
                if (weight <= 300 || width <= 75) increasing = true;
            }

            element.style.fontVariationSettings = `"wght" ${weight}, "wdth" ${width}`;
            element.style.letterSpacing = `${spacing}px`;
            element.style.transform = `scale(${scale}) rotate(${(scale - 1) * 8}deg)`;

            requestAnimationFrame(smoothMorph);
        }

        setTimeout(() => {
            smoothMorph(); // Start animation at different intervals for randomness
        }, index * 150);
    });
}


document.getElementById("promptTextInput").addEventListener("input", debounce(handleInput, 100));

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




//1280 x 1280