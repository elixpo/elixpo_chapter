let cyclePlaceholderPrompts = null;
let placeholder_prompts = [
    "--pr a futuristic city floating above the clouds, with neon lights reflecting on glass buildings --ar 16:9 --ld cinematic --hd --th sci-fi",
    "--pr a knight in shining armor riding a cybernetic horse, wielding a plasma sword --ar 4:5 --ld epic --hd --th fantasy",
    "--pr an astronaut playing chess with an alien on the surface of Mars --ar 3:2 --ld surreal --hd --th cosmic",
    "--pr a pirate ship sailing through the sky, with sails made of stardust --ar 21:9 --ld adventure --hd --th steampunk",
    "--pr a cat wearing a detective hat, examining a mysterious glowing footprint --ar 1:1 --ld noir --hd --th mystery",
    "--pr a samurai standing in a field of glowing cherry blossoms, under a blood-red moon --ar 2:3 --ld dramatic --hd --th historical",
    "--pr a dragon curled around a skyscraper, breathing blue fire into the night sky --ar 16:9 --ld fantasy --hd --th mythic",
    "--pr a wizard casting a spell in a library where books are flying around like birds --ar 5:4 --ld whimsical --hd --th magical realism",
    "--pr a robot bartender mixing colorful drinks in a futuristic cyberpunk bar --ar 21:9 --ld cyberpunk --hd --th neon",
    "--pr a giant octopus playing a grand piano underwater, surrounded by glowing fish --ar 9:16 --ld surreal --hd --th deep-sea",
    "--pr an eagle wearing sunglasses, flying over a desert with a map in its talons --ar 3:2 --ld cinematic --hd --th adventure",
    "--pr a Viking warrior standing on an iceberg, staring at the northern lights --ar 16:9 --ld epic --hd --th historical fantasy",
    "--pr an enchanted forest where trees glow with bioluminescent colors, and fairies fly around --ar 4:5 --ld mystical --hd --th ethereal",
    "--pr a panda wearing a space suit, floating inside a zero-gravity spaceship --ar 9:16 --ld futuristic --hd --th sci-fi",
    "--pr a cowboy riding a robotic horse through a cyberpunk city, with neon signs flashing around --ar 16:9 --ld western --hd --th tech-noir"
]


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




document.getElementById("promptTextInput").addEventListener("keydown", (e) => {

    if(e.ctrlKey && e.key === "Enter")
    {
        clearInterval(cyclePlaceholderPrompts);
        const promptTextInput = document.getElementById("promptTextInput");
        const promptText = promptTextInput.value;
        console.log(promptText);
    }

    if (promptTextInput.value.includes("--en")) {
        document.getElementById("pimpPrompt").classList.add("selected");
        enhanceMode = true;
    }
    else if (promptTextInput.value.includes("--pv")) {
        document.getElementById("privateBtn").classList.add("selected");
        privateMode = true;
    }
    else if (!promptTextInput.value.includes("--pv")) {
        document.getElementById("privateBtn").classList.remove("selected");
        privateMode = false;
    }
    else if(!promptTextInput.value.includes("--en"))
    {
        document.getElementById("pimpPrompt").classList.remove("selected");
        enhanceMode = false;
    }
})