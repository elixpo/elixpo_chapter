// Listens for a keyboard shortcut command named "reload"
chrome.commands.onCommand.addListener((shortcut) => {
    if (shortcut == "reload") {
        console.log("Reloading the page");
        chrome.runtime.reload();
    }
});

// --- New Code for Reimagining Feature ---

// 1. Create the context menu item when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "reimagine-image",
    title: "Reimagine with Elixpo",
    contexts: ["image"] // This makes it appear only when right-clicking an image
  });
});

// 2. Listen for a click on our new context menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Check if the clicked menu item is ours and if it's an image
  if (info.menuItemId === "reimagine-image" && info.srcUrl) {
    const originalImageUrl = info.srcUrl;
    
    // As per the issue, use the nanobanana model.
    // We encode the original image URL to safely use it in the new URL.
    const encodedImageUrl = encodeURIComponent(originalImageUrl);
    const apiEndpoint = `https://image.pollinations.ai/prompt/${encodedImageUrl}?model=nanobanana&image=${encodedImageUrl}`;

    // THE FIX: Instead of opening a popup, send a message to the content
    // script running on the current page.
    chrome.tabs.sendMessage(tab.id, {
      type: "REIMAGINE_IMAGE",
      imageUrl: apiEndpoint
    });
  }
});