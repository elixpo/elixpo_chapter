
let imageMode = false;
let processedPrompt = "";
let imageDataUrl = "";
let privateMode = false;
let enhanceMode = false;
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
  let generating = false;
//   let tokens = 0;
  let imageUrl = '';
  let formatted_prompt = "";
  let hashtags = "";
  let tags = "";
  let enhanceUrl = '';
  let downloadUrl = '';
  let pingUrl = '';
  let tagUrl = '';
  let ai_enhanced_prompt = '';
  let suffixPrompt = "";
  let serverReturnStatus = true;
  let imageVarType = "Fantasy";
  let modelType = "Flux-Core";
  let RatioValue = "1:1";
  let width = 2048;
  let height = 2048;
  let encodedPrompt = "";
  let currentIndex = 0;
  let websiteStaticMode = "Static";
  let controller;
  let blobs = [];
  let imgProg = 0;
  let fileName = "ElixpoAI-Generated-Image.jpeg";
  let specialDir = "";
  downloadUrl = "https://imgelixpo.vercel.app";
  pingUrl = "https://imgelixpo.vercel.app";
  enhanceUrl = "https://imgelixpo.vercel.app";
  let originalTitle = document.title;
  let timeoutId;
  let serverRef = db.collection('Server').doc('servers');
  let randomLogos = 
  [
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F1.jpeg?alt=media&token=01b96c7a-2ff4-4f7b-99e4-80f510315bb2",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F2.jpeg?alt=media&token=ace5b321-0c49-4b8c-912e-3d51ceb81545",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F3.jpeg?alt=media&token=41f1a76b-c1fc-476e-9156-570a8165d2c0",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F4.jpeg?alt=media&token=94e0f9b5-a1c3-4aa3-9fa7-239c1b08f983",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F5.jpeg?alt=media&token=d363bee4-01bc-4b8d-b90d-6e31a98c2bad",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F6.jpeg?alt=media&token=50c05867-0050-4d89-9c27-cb5040605d6d",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F7.jpeg?alt=media&token=4884744b-1c4d-46de-a245-5f96f344e268",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F8.jpeg?alt=media&token=6c50ad97-63ac-4bf8-9ac0-acf9c5ba0ca8",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F9.jpeg?alt=media&token=47923f1f-516a-4263-a613-d144e3ef6eb9",
    "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Guest%20Logos%2F10.jpeg?alt=media&token=88686e4f-c02c-4937-af00-3a471b7cf574"
  ]


const textarea = document.querySelector(".samplePrompt .promptTextInput");
const container = document.querySelector(".samplePrompt");
const baseHeight = 150; // Default container height
const maxHeight = 183;  // Maximum textarea height
const baseTextareaHeight = 45; // Minimum textarea height
const diceIcon = document.getElementById('OneImage');
const diceClasses = ['fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four'];

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
  
    // Determine base top position based on screen width
    let baseTop = window.innerWidth <= 700 ? "80%" : "78%";
  
    // Calculate the growth offset
    let growthOffset = newHeight - baseTextareaHeight;
    
    // On mobile, force growthOffset to always be 53px
    if (window.innerWidth <= 700) {
      growthOffset = 53;
    } else {
      growthOffset = Math.min(growthOffset, 53);
    }
  
    // If the textarea content shrinks below the base, reset container.
    if (growthOffset <= 0) {
      container.style.height = baseHeight + "px";
      container.style.top = baseTop;
    } else {
      // Adjust the container height and move it upwards based on the capped offset.
      container.style.height = baseHeight + growthOffset + "px";
      container.style.top = `calc(${baseTop} - ${growthOffset}px)`;
    }
  
    // Apply the new height to the textarea.
    textarea.style.height = newHeight + "px";
  
    setTimeout(() => {
      if (document.getElementById("samplePrompt").classList.contains("image")) {
        if (textarea.value.trim().length == 0) {
          container.style.height = "170px";
          container.style.top = window.innerWidth <= 700 ? "73%" : "78%";
        }
      } else {
        if (textarea.value.trim().length == 0) {
          container.style.height = baseHeight + "px";
          container.style.top = window.innerWidth <= 700 ? "73%" : "78%";
        }
      }
    }, 1000);
  });
  


async function pingServer() {
  try {
      const response = await fetch(`${pingUrl}/ping`, {
          method: "POST", // Use POST if you prefer to simulate heartbeat requests
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'heartbeat' }), // Send a heartbeat signal
          mode : "cors"
      });

      if (response.ok) {
          console.log(`${pingUrl} is up`);
          document.getElementById("serverStatus").classList.remove("offline");
      } else {
          console.log(`${pingUrl} is down`);
          document.getElementById("serverStatus").classList.add("offline");
      }
  } catch (error) {
      console.log(`${pingUrl} is down`);
      document.getElementById("serverStatus").classList.add("offline");
  }
}

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






document.getElementById("privateBtn").addEventListener("click", function() 
{
  privateMode = !privateMode;
  if (privateMode) {
    document.getElementById("privateBtn").classList.add("selected");
  }
  else 
  {
    document.getElementById("privateBtn").classList.remove("selected");
  }
});
document.getElementById("pimpPrompt").addEventListener("click", function()
{
  enhanceMode = !enhanceMode;
  if (enhanceMode) {
    document.getElementById("pimpPrompt").classList.add("selected");
  }
  else 
  {
    document.getElementById("pimpPrompt").classList.remove("selected");
  }
});

document.getElementById("promptIdea").addEventListener("click", function() {
  const randomIndex = Math.floor(Math.random() * prompts.length);
  document.getElementById("promptTextInput").value = prompts[randomIndex];
  const event = new Event("input", {bubbles: true});
  document.getElementById("promptTextInput").dispatchEvent(event);
  
});


if(localStorage.getItem("guestLogin") == true)
  {
      db.collection("users").doc(localStorage.getItem("ElixpoAIUser").toLowerCase()).get().then((doc) => {
          if (doc.exists) {
              // console.log("Document data:", doc.data());
              document.getElementById("userLogo").style.backgroundImage = `url(${doc.data().user_logo})`;
          } else {
             console.log("No such document!");
          }
      }).catch((error) => {
         location.reload();
      });
  }
  else 
  {
  const randomIndex = Math.floor(Math.random() * randomLogos.length);
  const randomLogo = randomLogos[randomIndex];
  document.getElementById("userLogo").style.backgroundImage = `url(${randomLogo})`;
  }

  
  function notify(msg)
  {
    document.getElementById("NotifTxt").innerText = `${msg}`;
      document.getElementById("savedMsg").classList.add("display");
      setTimeout(() => {
        document.getElementById("savedMsg").classList.remove("display");
      }, 1500);
  }

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
      timeoutId = setTimeout(() => {
          document.title = "We miss you! Come back soon!";
      }, 800);
  } else {
      clearTimeout(timeoutId);
      document.title = originalTitle;
  }
});

window.onload = () => {
  if (document.getElementById("imageTiles").classList.contains("hidden")) {
    document.querySelector("." + modelType).style.opacity = "1";
    document.querySelector("." + modelType).style.border = "1px solid #f4bb00";
} else {
    document.querySelector("." + modelType).style.opacity = "0";
    document.querySelector("." + modelType).style.border = "none";
}

if (document.getElementById("imageTiles").classList.contains("hidden")) {
    document.querySelector("." + imageVarType).style.opacity = "1";
    document.querySelector("." + imageVarType).style.border = "1px solid #f4bb00";
} else {
    document.querySelector("." + imageVarType).style.opacity = "0";
    document.querySelector("." + imageVarType).style.border = "none";
}
document.getElementById("promptTextInput").focus();
setInterval(() => {
  if (localStorage.getItem("ElixpoAIUser") == null) {
      redirectTo("src/auth/?notify=true"); //root hompage redirect
  } else {
      // document.querySelector(".patternContainer").classList.add("hidden");
      document.getElementById("accountMode").innerText = `Hi, ${localStorage.getItem("ElixpoAIUser").slice(0,1).toUpperCase() + localStorage.getItem("ElixpoAIUser").slice(1,20).slice(0,20)+"..."}`;
  }
}, 1000);
pingServer();
initControls();
}
window.addEventListener('resize', scaleContainer);
window.addEventListener('load', scaleContainer);


function initControls()
{
  const aspectRatioControls = document.getElementById('aspectRatioControls');
  const tiles = aspectRatioControls.getElementsByClassName('aspectRatioTile');
  
  // Set initial state
  const defaultTile = document.getElementById('aspectRatioTile1_1');
  defaultTile.classList.add('active');

  Array.from(tiles).forEach(tile => {
      tile.addEventListener('click', () => {
          // Remove active class from all tiles
          Array.from(tiles).forEach(t => {
              t.classList.remove('active');
              t.style.opacity = "0.35";
          });

          // Add active class to the clicked tile
          tile.classList.add('active');
          tile.style.opacity = "1";

          RatioValue = tile.querySelector('p').innerText;
          document.getElementById("selectedAspectRatio").innerText = RatioValue;
      });
  });




      diceIcon.addEventListener('click', () => {
          diceIcon.classList.add('click-effect');
          setTimeout(() => diceIcon.classList.remove('click-effect'), 200);

          diceIcon.classList.remove(diceClasses[currentIndex]);
          currentIndex = (currentIndex + 1) % diceClasses.length;
          diceIcon.classList.add(diceClasses[currentIndex]);
      });





      document.querySelectorAll(".tile").forEach((tile, index) => {
          tile.addEventListener("click", () => {
              if (tile.classList.contains("expand")) {
                  document.getElementById("showImage").classList.remove("hidden");
                  const whichClick = index + 1;
                  expandImage(document.getElementById("maskImageTile" + whichClick).getAttribute("data-id"));
              }
          });
      })


document.getElementById("backButton").addEventListener("click" , () => {
  document.getElementById("showImage").classList.add("hidden");
})
}


function expandImage(enc) {
  document.getElementById("PromptDisplay").innerHTML = "";
 let encodedEnteries = enc.split("###");
  document.getElementById("showImage").classList.remove("hidden");
  document.getElementById("showImage").querySelector("img").src = encodedEnteries[0];
  // console.log(encodedEnteries[0]);
  document.getElementById("downloadBox").setAttribute("data-id", encodedEnteries[0]);
  setTimeout(() => {
      document.getElementById("imgDisp").classList.add("loaded");
  }, 1200);
  document.getElementById("PromptDisplay").innerHTML = `<pre><code>${encodedEnteries[1]}</code></pre>`;
  const user = encodedEnteries[2];
  const genNumber = encodedEnteries[3];
  // document.getElementById("singAcceptBtn").setAttribute("data-id", genNumber);
  document.getElementById("genUserName").innerText = user;
}