let enhanceImage = false;
let privateImage = false;
let logoImage = true;


document.getElementById("tryItBtn").addEventListener("click", function(e) {
    if (document.getElementById("tryItBtn").getAttribute("data-mode") === "watchMode") {
        document.getElementById("tryItBtn").setAttribute("data-mode", "tryMode");
        document.getElementById("tryItBtnText").innerText = "Watch Feed";
        document.getElementById("imageFeedSectionDescriptionLeft").innerText = "Try generating images";
        document.getElementById("imageFeedSectionDescriptionRight").innerText = "texts using pollinations";
        let currentFeedMode = document.getElementById("imageOrTextCheckBox").checked;
        currentFeedMode ? currentFeedMode = "text" : currentFeedMode = "image";
        // console.log("currentFeedMode", currentFeedMode);
        prepareForImageTextTry(currentFeedMode);
    }

    else if (document.getElementById("tryItBtn").getAttribute("data-mode") === "tryMode") {
        document.getElementById("tryItBtn").setAttribute("data-mode", "watchMode");
        document.getElementById("tryItBtnText").innerText = "Try It";
        document.getElementById("imageFeedSectionDescriptionLeft").innerText = "This is the realtime image";
        document.getElementById("imageFeedSectionDescriptionRight").innerText = "text feed of pollinations";
        let currentFeedMode = document.getElementById("imageOrTextCheckBox").checked;
        currentFeedMode ? currentFeedMode = "text" : currentFeedMode = "image";
        // console.log("currentFeedMode", currentFeedMode);
        prepareForImageTextWatch(currentFeedMode);
    }
    
});

function prepareForImageTextTry(mode) 
{
    if(mode == "image")
    {
        let toggleElementListID = ["imageFeedText", "imageFeedDescription", "generationInfo", "tryItBtn", "imageHolderBackdrop", "genInfo", "imagePrompt", "ImagePromptSection"];
        toggleElementListID.forEach((elementID) => {
                document.getElementById(elementID).classList.add("tryitMode");
            });
        toogleMode();
        settleButtons(set=true);
    }
}

function prepareForImageTextWatch(mode)
{
    if(mode == "image")
    {
        let toggleElementListID = ["imageFeedText", "imageFeedDescription", "generationInfo", "tryItBtn", "imageHolderBackdrop", "genInfo", "imagePrompt", "ImagePromptSection"];
        toggleElementListID.forEach((elementID) => {
                document.getElementById(elementID).classList.remove("tryitMode");
            });
            toogleMode();
    }
}

function settleButtons(set)
{
    if(set == true)
    {
        let models = ["Flux", "Turbo", "gptImage"]
            let currentIndex = 1;
            document.getElementById("modelImage").innerText = models[currentIndex];

            document.getElementById("modelImage").addEventListener("click", () => {
                currentIndex = (currentIndex + 1) % models.length;
                document.getElementById("modelImage").innerHTML =`<ion-icon name="shuffle"></ion-icon> ${models[currentIndex]}` ;
        })

        document.getElementById("enhanceButton").addEventListener("click", () => {  
            enhanceImage = !enhanceImage;
            if (enhanceImage) {
                document.getElementById("enhanceButton").classList.add("enhance");
            } else {
                document.getElementById("enhanceButton").classList.remove("enhance");
            }
        });

        document.getElementById("privateButton").addEventListener("click", () => {  
            privateImage = !privateImage;
            if (privateImage) {
                document.getElementById("privateButton").classList.add("private");
            } else {
                document.getElementById("privateButton").classList.remove("private");
            }
        });

        document.getElementById("logoButton").addEventListener("click", () => {  
            logoImage = !logoImage;
            if (logoImage) {
                document.getElementById("logoButton").classList.add("logo");
            } else {
                document.getElementById("logoButton").classList.remove("logo");
            }
        });
    }
}

prepareForImageTextTry("image");


// window.addEventListener("load", function() {
//     let elementsWithTryitMode = document.querySelectorAll(".tryitMode");
//     elementsWithTryitMode.forEach((element) => {
//         element.classList.remove("tryitMode");
//     });
// });