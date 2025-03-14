
const promptTextInput = document.getElementById("promptTextInput");

document.getElementById("searchButtonText").addEventListener("click", async () => {
    const promptTextInput = document.getElementById("promptTextInput");
    if (promptTextInput.value.trim() !== "") {
        generatingModeHandle();
    } else {
        document.getElementById("promptTextInput").setAttribute("placeholder", "An Empty Thought? Tell me something!");
        setTimeout(() => {
            document.getElementById("promptTextInput").setAttribute("placeholder", "What's on your mind?");
        }, 3000);
        document.getElementById("promptTextInput").focus();
    }
});






document.getElementById("downloadBox").addEventListener("click", (e) => {
    const downloadUrl = document.getElementById("downloadBox").getAttribute("data-id");
    downloadBlob(downloadUrl);
})

function copyTextFromDiv() {
    // Get the div element
    const div = document.getElementById('PromptDisplay');

    // Create a temporary textarea element to use for copying
    const textarea = document.createElement('textarea');
    textarea.value = div.innerText; // Get the inner text of the div
    document.body.appendChild(textarea);

    // Select and copy the text
    textarea.select();
    textarea.setSelectionRange(0, 99999); // For mobile devices
    document.execCommand('copy');

    // Remove the temporary textarea
    document.body.removeChild(textarea);

    // Optionally, give user feedback
    document.getElementById("NotifTxt").innerText = "Prompt Copied!";
    document.getElementById("savedMsg").classList.add("display");
    setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
    }, 1500);
    document.getElementById("NotifTxt").innerText = "Greetings!";
} 

document.getElementById('copyPrompt').addEventListener('click', copyTextFromDiv);

