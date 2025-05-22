document.getElementById("tryItBtnText").addEventListener("click", function() {
    let currentFeedMode = document.getElementById("imageOrTextCheckBox").checked;
    currentFeedMode ? currentFeedMode = "text" : currentFeedMode = "image";
    console.log("currentFeedMode", currentFeedMode);
    prepareForImageTextTry(currentFeedMode);
});

function prepareForImageTextTry(mode) 
{
    if(mode == "image")
    {
        
    }
}