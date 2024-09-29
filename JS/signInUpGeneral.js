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


 window.onload = () => {
      if(localStorage.getItem("ElixpoAIUser") !== null) {
         document.getElementById("form_logout").classList.remove("hidden");
         document.getElementById("form_login").classList.add("hidden");
         document.getElementById("form_register").classList.add("hidden");
      }
      else
      {
         document.getElementById("form_logout").classList.add("hidden");
         document.getElementById("form_login").classList.remove("hidden");
         document.getElementById("form_register").classList.add("hidden");
      }
}


document.querySelectorAll("img").forEach((img) => { 
   img.addEventListener("load", () => { 
      img.classList.remove("blur");
   });
});

document.getElementById("signUpFormBtn").addEventListener("click", () => {
  document.getElementById("form_register").classList.add("hidden");
   document.getElementById("form_login").classList.remove("hidden"); 
})

document.getElementById("signInFormBtn").addEventListener("click", () => {
   document.getElementById("form_login").classList.add("hidden");
    document.getElementById("form_register").classList.remove("hidden"); 
 })



document.getElementById("logoutBtn").addEventListener("click", () => {
   localStorage.removeItem("ElixpoAIUser");
   localStorage.removeItem("metadataCache");
   localStorage.removeItem("currWidth");
   
   document.getElementById("form_logout").classList.add("hidden");
   document.getElementById("form_register").classList.add("hidden");
   document.getElementById("form_login").classList.remove("hidden");
})

document.getElementById("readDocs").addEventListener("click", () => {
   location.replace("elixpo_homepage.html");
});

document.getElementById("reDirectPage").addEventListener("click", () => {
   location.replace("elixpoArtGenerator.html");
});


document.getElementById("passwordShowHideSignInPassword").addEventListener("click", (e) => {
   const passwordField = document.getElementById("signInPassword");
   const passwordFieldType = passwordField.getAttribute("type");
   
   if (passwordFieldType === "password") {
       passwordField.setAttribute("type", "text");
   } else {
       passwordField.setAttribute("type", "password");
   }
});


document.getElementById("passwordShowHideSignUpPassword").addEventListener("click", (e) => {
   const passwordField = document.getElementById("signupPsswd");
   const passwordFieldType = passwordField.getAttribute("type");
   
   if (passwordFieldType === "password") {
       passwordField.setAttribute("type", "text");
   } else {
       passwordField.setAttribute("type", "password");
   }
});



document.getElementById("passwordShowHideSignUpPasswordConf").addEventListener("click", (e) => {
   const passwordField = document.getElementById("signupPsswdConf");
   const passwordFieldType = passwordField.getAttribute("type");
   
   if (passwordFieldType === "password") {
       passwordField.setAttribute("type", "text");
   } else {
       passwordField.setAttribute("type", "password");
   }
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

// window.addEventListener('resize', scaleContainer);
// window.addEventListener('load', scaleContainer);