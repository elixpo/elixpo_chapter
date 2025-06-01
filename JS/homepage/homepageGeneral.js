let promptIndex = 0;
const typewriterElement = document.getElementById('searchText');

window.addEventListener('resize', scaleContainer, generateAsciiArt);
window.addEventListener('load', scaleContainer);

setInterval(() => {
    // generateAsciiArt();
}, 5000);

document.getElementById("visitCreateArt").addEventListener("click", function() {
    if(localStorage.getItem("ElixpoAIUser") != null || localStorage.getItem("ElixpoAIUser") != undefined) {
        redirectTo("src/create");
    }
    else if((localStorage.getItem("ElixpoAIUser") == undefined) || localStorage.getItem("ElixpoAIUser") == null) 
    {
        redirectTo("src/auth");
    }
    else 
    {
        redirectTo("src/auth"); 
    }
});
  
document.getElementById("visitDocs").addEventListener("click", function() {
  
    redirectTo("blogs/elixpo_art");
});

document.getElementById("visitFeed").addEventListener("click", function() {
  
    redirectTo("src/feed");
});

document.getElementById("integrationsIcon").addEventListener("click", () => {
    redirectTo("integrations/")
})

document.getElementById("kaizenIcon").addEventListener("click", () => {
    location.href = "https://www.kaizenyumee.com/"
})

document.getElementById("visitIntegration").addEventListener("click", () => {
    redirectTo("integrations/")
})

document.getElementById("visitGithub").addEventListener("click", () => {
    window.open("https://github.com/Circuit-Overtime/elixpo_ai_chapter/", "_blank");
})

document.getElementById("discordBotRedirect").addEventListener("click", () => {
    window.open("https://discord.com/oauth2/authorize?client_id=1214916249222643752", "_blank");
});

document.getElementById("chromeExtentionRedirect").addEventListener("click", () => {
    window.open("https://chromewebstore.google.com/detail/elixpo-art-select-text-an/hcjdeknbbbllfllddkbacfgehddpnhdh", "_blank");
});





function scaleContainer() {
    if((!window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches))
    {
 
    const container = document.querySelector('.container');
    const containerWidth = 1519;
    const containerHeight = 730;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
 
    // Calculate scale factors for both width and height
    const scaleWidth = windowWidth / containerWidth;
    const scaleHeight = windowHeight / containerHeight;
 
    // Use the smaller scale factor to ensure the container fits in the viewport
    const scale = Math.min(scaleWidth, scaleHeight);
 
    // Apply the scale transform
    container.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
 }


 