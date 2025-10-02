// Style URL Parameter Handler for Create Page
// This script handles style parameters from the art styles gallery

document.addEventListener("DOMContentLoaded", function () {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const styleParam = urlParams.get("style");

  if (styleParam) {
    handleStyleParameter(styleParam);
  }
});

function handleStyleParameter(style) {
  // Style to prompt mapping
  const stylePrompts = {
    renaissance: "renaissance art style, classical painting, realistic proportions, chiaroscuro lighting",
    baroque: "baroque art style, dramatic lighting, rich colors, ornate decoration, emotional intensity",
    impressionism: "impressionist art style, visible brushstrokes, light effects, outdoor scene",
    "art-nouveau": "art nouveau style, organic flowing lines, natural forms, decorative elements",
    abstract: "abstract art style, non-representational, geometric shapes, bold colors",
    surrealism: "surrealist art style, dreamlike imagery, fantastical elements, unconscious mind",
    "pop-art": "pop art style, bright colors, commercial imagery, mass culture themes",
    minimalism: "minimalist art style, simple forms, clean lines, limited color palette",
    cyberpunk: "cyberpunk art style, neon colors, futuristic technology, urban dystopia",
    synthwave: "synthwave art style, retro-futuristic, neon grids, 1980s aesthetic",
    vaporwave: "vaporwave art style, pastel colors, glitch effects, nostalgic imagery",
    "digital-painting": "digital painting style, detailed artwork, professional illustration",
  };

  const promptText = stylePrompts[style];

  if (promptText) {
    // Wait for the page to fully load, then populate the prompt
    setTimeout(() => {
      const promptInput = document.getElementById("promptTextInput");
      if (promptInput) {
        promptInput.value = promptText;

        // Add visual feedback
        showStyleNotification(style);

        // Focus on the input for user to modify if needed
        promptInput.focus();
        promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
      }
    }, 500);
  }
}

function showStyleNotification(style) {
  // Create a notification to show which style was selected
  const notification = document.createElement("div");
  notification.className = "style-notification";
  notification.innerHTML = `
        <i class="fas fa-palette"></i>
        <span>Style "${formatStyleName(style)}" has been selected</span>
    `;

  // Add styles
  Object.assign(notification.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    background: "linear-gradient(135deg, #8d49fd, #5691f3)",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "25px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontFamily: "Kanit, serif",
    fontSize: "0.9rem",
    fontWeight: "500",
    boxShadow: "0 4px 15px rgba(141, 73, 253, 0.3)",
    zIndex: "10000",
    opacity: "0",
    transform: "translateX(100%)",
    transition: "all 0.3s ease",
  });

  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.style.opacity = "1";
    notification.style.transform = "translateX(0)";
  }, 100);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transform = "translateX(100%)";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

function formatStyleName(style) {
  return style
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Add custom CSS for the notification
const styleNotificationCSS = `
    .style-notification {
        animation: slideInRight 0.3s ease;
    }
    
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
`;

// Inject CSS
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styleNotificationCSS;
document.head.appendChild(styleSheet);
