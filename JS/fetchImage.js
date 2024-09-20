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

let images = [];
const texts = [];
const aspectRatios = ['aspect-9-16', 'aspect-4-3', 'aspect-16-9', 'aspect-3-2', 'aspect-1-1'];
const displayedImages = new Set();
const batchSize = 0;

let segmentSize;
let availableBatches = [];
let fetchedBatches = new Set();
let isFetching = false;
let imageLatch = [];
let rgbKineticSliderInstance = null;

async function initialize() {
    globalThis.userName = localStorage.getItem('ElixpoAIUser');
    segmentSize = await getTotalGenOnServer();
    spanAdjust(50);
    fetchImagesConcurrently();
    setInterval(async () => {
        segmentSize = await getTotalGenOnServer();
    }, 60000);
    setTimeout(() => spanAdjust(50), 1000);
}

async function getTotalGenOnServer() {
    const snapshot = await db.collection('Server').doc("totalGen").get();
    const totalGen = parseInt(snapshot.data().value);
    segmentSize = totalGen;
    initializeBatches();
    return totalGen;
}

function initializeBatches() {
    availableBatches = shuffle(Array.from({ length: Math.ceil(segmentSize / batchSize) }, (_, i) => i));
}

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
        img.crossOrigin = "Anonymous";
        img.src = imgUrl;

        img.onload = () => {
            const colorThief = new ColorThief();
            const [r, g, b] = colorThief.getColor(img);
            resolve(`rgb(${r}, ${g}, ${b})`);
        };

        img.onerror = () => {
            console.error("Failed to load image for dominant color extraction");
            resolve(""); // or a fallback color
        };
    });
}

async function fetchImages(startAt = 0) {
    if (isFetching) return;
    isFetching = true;

    const batchIndex = availableBatches.pop();
    const calculatedStartAt = startAt || (batchIndex * batchSize);

    try {
        const querySnapshot = await db.collection("ImageGen")
            .where("genNum", ">", -1)
            .orderBy("genNum")
            .orderBy("total_gen_number")
            .orderBy("timestamp")
            .startAt(calculatedStartAt)
            .limit(batchSize)
            .get();

        if (querySnapshot.empty) {
            isFetching = false;
            return;
        }

        querySnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!displayedImages.has(data.Imgurl0)) {
                displayedImages.add(data.Imgurl0);
                imageLatch.push(data);
            }
        });

        fetchedBatches.add(batchIndex);
        loadImagesFromLatch();
    } catch (error) {
        console.error("Error fetching images: ", error);
    } finally {
        isFetching = false;
    }
}

async function loadImagesFromLatch() {
    const promises = [];
    while (imageLatch.length > 0) {
        const data = imageLatch.shift();
        const aspectRatio = aspectRatios[["9:16", "4:3", "16:9", "3:2", "1:1"].indexOf(data.ratio)];
        const majorityColor = await applyDominantColor(data.Imgurl0);

        const itemHtml = `
            <div class="masonry-item ${aspectRatio} expanded" id="masonryTile${data.genNum}" 
                onclick="imageDetails(this)" 
                data-id="${data.likes}###${data.ratio}###${data.theme}###${data.formatted_prompt}###${data.user}###${data.Imgurl0}###${data.hashtags}" 
                style="background: ${majorityColor}; background-size: cover; background-position: center center;">
            </div>
        `;
        masonry.innerHTML += itemHtml;

        const masonryTile = document.getElementById("masonryTile" + data.genNum);
        masonryTile.classList.add("loaded");
        promises.push(loadImage(data.Imgurl0, masonryTile));

        if (promises.length >= 8) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }

    if (promises.length > 0) {
        await Promise.all(promises);
    }
}

function loadImage(imageUrl, masonryTile) {
    return new Promise((resolve, reject) => {
        const imgElement = new Image();
        imgElement.src = imageUrl;

        imgElement.onload = () => {
            masonryTile.classList.remove("loading");
            masonryTile.classList.add("loaded");
            resolve();
        };

        imgElement.onerror = () => {
            console.error(`Failed to load image: ${imageUrl}`);
            masonryTile.classList.remove("loading");
            reject();
        };

        masonryTile.appendChild(imgElement);
    });
}

async function fetchImagesConcurrently() {
    const firstStartAt = 0;
    const secondStartAt = batchSize;

    await Promise.all([
        fetchImages(firstStartAt),
        fetchImages(secondStartAt)
    ]);
}

function initializeSlider(majorityColor) {
    disposeSlider();
    rgbKineticSliderInstance = new rgbKineticSlider({
        slideImages: images,
        itemsTitles: texts,
        backgroundDisplacementSprite: 'https://images.unsplash.com/photo-1558865869-c93f6f8482af?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2081&q=80',
        cursorDisplacementSprite: 'https://images.unsplash.com/photo-1558865869-c93f6f8482af?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2081&q=80',
        cursorImgEffect: true,
        cursorTextEffect: false,
        cursorScaleIntensity: 0.65,
        cursorMomentum: 0.14,
        swipe: true,
        swipeDistance: window.innerWidth * 0.4,
        swipeScaleIntensity: 2,
        slideTransitionDuration: 1,
        transitionScaleIntensity: 30,
        transitionScaleAmplitude: 160,
        nav: true,
        navElement: '.next',
        imagesRgbEffect: false,
        imagesRgbIntensity: 0.9,
        navImagesRgbIntensity: 80,
        textsDisplay: true,
        textsSubTitleDisplay: true,
        textsTiltEffect: true,
        googleFonts: ['Playfair Display:700', 'Roboto:400'],
        buttonMode: false,
        textsRgbEffect: true,
        textsRgbIntensity: 0.03,
        navTextsRgbIntensity: 15,
        textTitleColor: 'white',
        textTitleSize: 125,
        mobileTextTitleSize: 125,
        textTitleLetterspacing: 3,
        textSubTitleColor: 'white',
        textSubTitleSize: 21,
        mobileTextSubTitleSize: 21,
        textSubTitleLetterspacing: 2,
        textSubTitleOffsetTop: 90,
        mobileTextSubTitleOffsetTop: 90
    });
}

function disposeSlider() {
    if (rgbKineticSliderInstance && typeof rgbKineticSliderInstance.dispose === 'function') {
        rgbKineticSliderInstance.dispose();
    }
}

function removeCanvasIfExists() {
    const container = document.getElementById('rgbKineticSlider');
    if (container) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
            canvas.remove();
            console.log('Canvas removed successfully.');
        } else {
            console.log('No canvas element found to remove.');
        }
    } else {
        console.log('Container with ID "rgbKineticSlider" does not exist.');
    }
}

async function imageDetails(self) {
    // Cache DOM element references
    const tagElement = document.getElementById("tag");
    const maskDisplayImage = document.getElementById("MaskdisplayImage");
    const rgbKineticSlider = document.getElementById("rgbKineticSlider");
    const promptDisplay = document.getElementById("PromptDisplay");
    const generationAspectRatio = document.getElementById("generationAspectRatio");
    const aspectRatioTileText = document.getElementById("aspectRatioTileText");
    const themeViewerText = document.getElementById("themeViewerText");
    const userCreditsName = document.getElementById("userCreditsName");
    const themeViewer = document.getElementById("themeViewer");
    
    // Remove existing canvas if any
    removeCanvasIfExists();
    
    // Clear images array
    images = [];
    
    console.log("Image Clicked");
    
    // Get and parse data
    const data = self.getAttribute("data-id").split("###");
    const [likes, ratio, theme, formatted_prompt, user, link, hashtags] = data;
    
    // Apply dominant color
    const majorityColor = await applyDominantColor(link);
    
    // Batch DOM updates
    tagElement.innerHTML = hashtags.split(",").map(tag => `<span>${tag}</span>`).join('');
    generationAspectRatio.innerHTML = ratio;
    aspectRatioTileText.innerHTML = ratio;
    promptDisplay.innerHTML = marked.parse(formatted_prompt);
    themeViewerText.innerHTML = theme;
    userCreditsName.innerHTML = user;
    themeViewer.style.background = `url("./CSS/IMAGES/THEMES/${theme.toLowerCase()}.jpeg")`;
    rgbKineticSlider.style.background = majorityColor;
    
    // Update display classes
    maskDisplayImage.classList.add("displayInfo");
    document.getElementById("promptEngineering").style.display = "none";
    maskDisplayImage.classList.add("displayinfo");
    
    // Push link to images array
    images.push(link);
    
    // Initialize slider
    spanAdjust(50);
    initializeSlider(majorityColor);
}

initialize();
