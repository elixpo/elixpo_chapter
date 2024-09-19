
const firebaseConfig = {
    apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
    authDomain: "elixpoai.firebaseapp.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: "718153866206",
    appId: "1:718153866206:web:671c00aba47368b19cdb4f"
};

let images = [];
const texts = [];
let rgbKineticSliderInstance = null;

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const masonry = document.querySelector('.masonry');
const aspectRatios = ['aspect-9-16', 'aspect-4-3', 'aspect-16-9', 'aspect-3-2', 'aspect-1-1'];
const displayedImages = new Set(); // Track displayed images

let currentSegment = 0; // Start with the first 100 images
const batchSize = 20;
let segmentSize;
let availableBatches = []; // Store available batch indices within the current segment
let fetchedBatches = new Set(); // Track fetched batches within the segment
let lastScrollTop = 0;
let isFetching = false;
let imageLatch = [];
spanAdjust(50);

function initializeSlider(majorityColor) {
    // Dispose of the existing instance if it exists
    if (rgbKineticSliderInstance && typeof rgbKineticSliderInstance.dispose === 'function') {
        rgbKineticSliderInstance.dispose();
    }

    // Create a new instance of rgbKineticSlider with updated data
    rgbKineticSliderInstance = new rgbKineticSlider({
        slideImages: images, // array of images
        itemsTitles: texts, // array of titles / subtitles

        backgroundDisplacementSprite: 'https://images.unsplash.com/photo-1558865869-c93f6f8482af?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2081&q=80', // slide displacement image 
        cursorDisplacementSprite: 'https://images.unsplash.com/photo-1558865869-c93f6f8482af?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2081&q=80', // cursor displacement image

        cursorImgEffect: true, // enable cursor effect
        cursorTextEffect: false, // enable cursor text effect
        cursorScaleIntensity: 0.65, // cursor effect intensity
        cursorMomentum: 0.14, // lower is slower

        swipe: true, // enable swipe
        swipeDistance: window.innerWidth * 0.4, // swipe distance - ex : 580
        swipeScaleIntensity: 2, // scale intensity during swiping

        slideTransitionDuration: 1, // transition duration
        transitionScaleIntensity: 30, // scale intensity during transition
        transitionScaleAmplitude: 160, // scale amplitude during transition

        nav: true, // enable navigation
        navElement: '.next', // set nav class

        imagesRgbEffect: false, // enable img rgb effect
        imagesRgbIntensity: 0.9, // set img rgb intensity
        navImagesRgbIntensity: 80, // set img rgb intensity for regular nav

        textsDisplay: true, // show title
        textsSubTitleDisplay: true, // show subtitles
        textsTiltEffect: true, // enable text tilt
        googleFonts: ['Playfair Display:700', 'Roboto:400'], // select google font to use
        buttonMode: false, // enable button mode for title
        textsRgbEffect: true, // enable text rgb effect
        textsRgbIntensity: 0.03, // set text rgb intensity
        navTextsRgbIntensity: 15, // set text rgb intensity for regular nav

        textTitleColor: 'white', // title color
        textTitleSize: 125, // title size
        mobileTextTitleSize: 125, // title size
        textTitleLetterspacing: 3, // title letterspacing

        textSubTitleColor: 'white', // subtitle color ex : 0x000000
        textSubTitleSize: 21, // subtitle size
        mobileTextSubTitleSize: 21, // mobile subtitle size
        textSubTitleLetterspacing: 2, // subtitle letter spacing
        textSubTitleOffsetTop: 90, // subtitle offset top
        mobileTextSubTitleOffsetTop: 90, // mobile subtitle offset top
    });
}



function disposeSlider() {
    if (rgbKineticSlider && typeof rgbKineticSlider.dispose === 'function') {
        rgbKineticSlider.dispose(); // Clean up existing instance
    }
}

async function gettotalGenOnServer() {
    
    const snapshot = await db.collection('Server').doc("totalGen").get();
    console.log("Total Gen:", snapshot.data().value);
    let totalGen = parseInt(snapshot.data().value);
    segmentSize = totalGen;
    initializeBatches();
    fetchImages();
    
    return totalGen;
}




// // Initialize available batches for the current segment
function initializeBatches() {
    availableBatches = [];
    for (let i = 0; i < Math.ceil(segmentSize / batchSize); i++) {
        availableBatches.push(i);
    }
    availableBatches = shuffle(availableBatches); // Randomize the order of fetching
}

// Shuffle function to randomize batches
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function applyDominantColor(imgUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";  // Attempt to load image with CORS headers
        img.src = imgUrl;

        img.onload = () => {
            const colorThief = new ColorThief();
            const dominantColor = colorThief.getColor(img);
            let dominantColorScheme = `rgb(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]})`;
            console.log("Dominant Color: ", dominantColorScheme);
            resolve(dominantColorScheme);
        };

        img.onerror = () => {
            console.error("Failed to load image for dominant color extraction");
            resolve("");  // Resolve with an empty string or a fallback color
        };
    });
}






async function fetchImages() {
    if (isFetching) return;
    isFetching = true;

    if (availableBatches.length === 0) {
        currentSegment++;
    }

    if (availableBatches.length === 0) {
        isFetching = false;
        return;
    }

    const batchIndex = availableBatches.pop();
    const startAt = (currentSegment * segmentSize) + (batchIndex * batchSize);
    console.log("fetch_images called with startAt: " + startAt);
    const imageRef = db.collection("ImageGen");

    try {
        // Fetch the batch of images within the current segment
        const querySnapshot = await imageRef
            .where("genNum", ">", -1) // genNum is greater than 0
            .orderBy("genNum")
            .orderBy("total_gen_number")
            .orderBy("timestamp")
            .startAt(startAt) // Start at the calculated index
            .limit(20) // Limit the number of results to batchSize
            .get();

        if (querySnapshot.empty) {
            isFetching = false;
            return;
        }

        for (const doc of querySnapshot.docs) {
            const data = doc.data();
            if (!displayedImages.has(data.Imgurl0)) {
                displayedImages.add(data.Imgurl0);

                // Store the image data in the buffer
                imageLatch.push(data);
            }
        }
        isFetching = false;
        fetchedBatches.add(batchIndex);

        // Load images from the buffer after fetching
        loadImagesFromLatch();

    } catch (error) {
        console.error("Error fetching images: ", error);
        isFetching = false;
    }
}

async function loadImagesFromLatch() {
    while (imageLatch.length > 0) {
        const data = imageLatch.shift(); // Get the first item in the buffer

        let aspectRatio = data.ratio;
        if (aspectRatio == "1:1") {
            aspectRatio = aspectRatios[4];
        } else if (aspectRatio == "9:16") {
            aspectRatio = aspectRatios[0];
        } else if (aspectRatio == "4:3") {
            aspectRatio = aspectRatios[1];
        } else if (aspectRatio == "16:9") {
            aspectRatio = aspectRatios[2];
        } else if (aspectRatio == "3:2") {
            aspectRatio = aspectRatios[3];
        }

        let majorityColor = await applyDominantColor(data.Imgurl0);   
        let imgIndex = data.genNum; 
        console.log("Majority Color: ", majorityColor);

        const itemFetchData = `
            <div class="masonry-item ${aspectRatio} expanded" id="masonryTile${imgIndex}" onclick="imageDetails(this)" data-id="${data.likes+"###"+data.ratio+"###"+data.theme+"###"+data.formatted_prompt+"###"+data.user+"###"+data.Imgurl0+"###"+data.hashtags}" style="background: ${majorityColor}; background-size: cover; background-position: center center;">
                <img id="img${imgIndex}" src="${data.Imgurl0}" alt="Image" />
            </div>
        `;
        
        masonry.innerHTML += (itemFetchData);
        document.getElementById("masonryTile"+imgIndex).classList.add("loading");
        document.getElementById("img"+imgIndex).addEventListener("load", () => {
            document.getElementById("masonryTile"+imgIndex).classList.remove("loading");
            document.getElementById("masonryTile"+imgIndex).classList.add("loaded");
        })
    }
}






function getDominantColor(imageData) {
    const data = imageData.data;    
    let r = 0, g = 0, b = 0;
    const length = data.length;
    const count = length / 4;

    for (let i = 0; i < length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }

    // Calculate the average color
    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);

    return `rgb(${r}, ${g}, ${b})`;
}

function removeCanvasIfExists() {
    // Get the DOM element with the ID 'rgbKineticSlider'
    const container = document.getElementById('rgbKineticSlider');

    // Check if the container element exists
    if (container) {
        // Find the canvas element within the container
        const canvas = container.querySelector('canvas');
        
        // If a canvas element is found, remove it
        if (canvas) {
            canvas.remove();
            console.log('Canvas removed successfully.');
            return true
        } else {
            console.log('No canvas element found to remove.');
            return false;
        }
    } else {
        console.log('Container with ID "rgbKineticSlider" does not exist.');
        return false;
    }
}

async function imageDetails(self)
{
   
    removeCanvasIfExists();
    images = [];
    console.log("Image Clicked");
    let data = self.getAttribute("data-id");
    let details = data.split("###");
    let majorityColor = await applyDominantColor(details[5]);
    document.getElementById("MaskdisplayImage").classList.add("displayInfo");
    spanAdjust(50);
    initializeSlider(majorityColor);
    document.getElementById("rgbKineticSlider").style.background = majorityColor;
    document.getElementById("promptEngineering").style.display = "none";
    document.getElementById("MaskdisplayImage").classList.add("displayinfo");
    let likes = details[0];
    let ratio = details[1];
    let theme = details[2];
    let formatted_prompt = details[3];
    let user = details[4];
    let link = details[5];
    let hashtags = details[6];
    hashtags = hashtags.split(",");
    hashtags.forEach(element => {
        var item = `<span>${element}</span>`
        document.getElementById("tag").innerHTML += item;
    });
    document.getElementById("generationAspectRatio").innerHTML = ratio;
    document.getElementById("aspectRatioTileText").innerHTML = ratio;
    document.getElementById("PromptDisplay").innerHTML = marked.parse(formatted_prompt);
    document.getElementById("themeViewerText").innerHTML = theme;
    document.getElementById("userCreditsName").innerHTML = user;
    document.getElementById("themeViewer").style.background = 'url("./CSS/IMAGES/THEMES/'+theme.toLowerCase()+'.jpeg")';


    images.push(link);

    
    
}

document.getElementById("promptSectionBackButton").addEventListener("click", () => {
    document.getElementById("promptEngineering").style.display = "none";
});
document.getElementById("promtEngineeringSection").addEventListener("click", () => {
    document.getElementById("promptEngineering").style.display = "block";
})




document.getElementById("masonry").addEventListener("scroll", () => {
    const scrollTop = masonry.scrollTop;
    if (scrollTop > lastScrollTop && scrollTop + masonry.clientHeight >= masonry.scrollHeight - 300) {
        initializeBatches();
        fetchImages();
    }   
    lastScrollTop = scrollTop;
});

document.addEventListener('DOMContentLoaded', () => {
    globalThis.userName = localStorage.getItem('ElixpoAIUser');
    gettotalGenOnServer();
    spanAdjust(50);
    
});

setInterval(async() => {
    segmentSize = await gettotalGenOnServer();
    
}, 60000);

setTimeout(() => {
    spanAdjust(50);
}   , 1000);