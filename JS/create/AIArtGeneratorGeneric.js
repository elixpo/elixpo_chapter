
const textarea = document.querySelector(".samplePrompt .promptTextInput");
const container = document.querySelector(".samplePrompt");
const baseHeight = 130; // Default container height
const maxHeight = 183;  // Maximum textarea height
const baseTextareaHeight = 45; // Minimum textarea height


const combinations = [
    { configuration: 1, roundness: 1 },
    { configuration: 1, roundness: 2 },
    { configuration: 1, roundness: 4 },
    { configuration: 2, roundness: 2 },
    { configuration: 2, roundness: 3 },
  
  ];
  let prev = 0; //counts iteratiuons for the boxes
  const randomTile = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);





textarea.addEventListener("input", function () {
  textarea.style.height = "auto"; // Reset height
  const newHeight = Math.min(textarea.scrollHeight, maxHeight);

  // Calculate the growth offset, but cap it to 53px.
  const growthOffset = Math.min(newHeight - baseTextareaHeight, 53);

  // If the textarea content shrinks below the base, reset container.
  if (growthOffset <= 0) {
    container.style.height = baseHeight + "px";
    container.style.top = "80%";
  
  } else {
    // Adjust the container height based on the capped offset.
    container.style.height = baseHeight + growthOffset + "px";
    // Move the container upwards by the capped offset.
    container.style.top = `calc(80% - ${growthOffset}px)`;
  }
  
  // Apply the new height to the textarea.
  textarea.style.height = newHeight + "px"; 

setTimeout(() => {
  if(textarea.value.trim().length == 0)
  {
    container.style.height = baseHeight + "px";
    container.style.top = "80%";
    if (window.innerWidth <= 700) {
      container.style.top = "75%";
    }
  }
}, 1000)
});




  document.getElementById("loginButton").addEventListener("click", function() {
    redirectTo("src/auth");
  });
  document.getElementById("navBarDocs").addEventListener("click", function() {
    redirectTo("blogs/elixpo_art");
  });

  document.getElementById("navBarGitHub").addEventListener("click", () => {
    location.href = "https://github.com/Circuit-Overtime/elixpo_ai_chapter"
  })

const uniqueRand = (min, max, prev) => {
  let next = prev;
  
  while(prev === next) next = randomTile(min, max);
  
  return next;
}



// setInterval(() => {
//   const index = uniqueRand(0, combinations.length - 1, prev),
//         combination = combinations[index];
  
//   wrapper.dataset.configuration = combination.configuration;
//   wrapper.dataset.roundness = combination.roundness;
  
//   prev = index;
// },1000);




function scaleContainer() {
  if((!window.matchMedia("(max-width: 1080px) and (max-height: 1440px)").matches))
  {

    // the viewport is in phone
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


document.getElementById("userLogo").addEventListener("click", function() {
  if(navigator.userAgent.includes("Mobile"))
  {
    if(document.getElementById("loginNavBar").classList.contains("hidden"))
      {
        document.getElementById("loginNavBar").classList.remove("hidden");
        document.getElementById("userLogo").style.left = "75%";
        document.getElementById("userLogo").style.zIndex = "100";
      }
      else 
      {
        document.getElementById("loginNavBar").classList.add("hidden");
        document.getElementById("userLogo").style.left = "75%";
        document.getElementById("userLogo").style.zIndex = "10";
      }
  }
  else if(navigator.userAgent.includes("Win"))
  {
    if(document.getElementById("loginNavBar").classList.contains("hidden"))
      {
        document.getElementById("loginNavBar").classList.remove("hidden");
        document.getElementById("userLogo").style.left = "5%";
        document.getElementById("userLogo").style.zIndex = "100";
      }
      else 
      {
        document.getElementById("loginNavBar").classList.add("hidden");
        document.getElementById("userLogo").style.left = "95%";
        document.getElementById("userLogo").style.zIndex = "10";
      }
  }
  
    
});







window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);
