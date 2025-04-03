let enhanceMode = false;
let privateMode = false;
let isImageMode = false;
let currentIndex = 0;
let selectedImageQuality = "SD";
let generationNumber = 2;
const diceIcon = document.getElementById('OneImage');
const diceClasses = ['fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four'];

diceIcon.addEventListener('click', () => {
    diceIcon.classList.add('click-effect');
    setTimeout(() => diceIcon.classList.remove('click-effect'), 200);

    diceIcon.classList.remove(diceClasses[currentIndex]);
    currentIndex = (currentIndex + 1) % diceClasses.length;
    diceIcon.classList.add(diceClasses[currentIndex]);
});


document.getElementById("privateBtn").addEventListener("click", function() 
{
  privateMode = !privateMode;
  if (privateMode) {
    document.getElementById("privateBtn").classList.add("selected");
    notify("Images will be now private! No Server Inference");
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
    notify("Pimped prompt mode enabled");
  }
  else 
  {
    document.getElementById("pimpPrompt").classList.remove("selected");
  }
});

document.querySelectorAll(".qualitySelection > .imageQuality").forEach(function(element) {
  element.addEventListener("click", function() {
    document.querySelectorAll(".imageQuality").forEach(function(el) {
      el.classList.remove("selected");
    });
    this.classList.add("selected");
    selectedImageQuality = this.getAttribute("data-quality");
  });
});

document.getElementById("promptIdea").addEventListener("click", function() {
  const randomIndex = Math.floor(Math.random() * prompts.length);
  document.getElementById("promptTextInput").value = prompts[randomIndex];
  const event = new Event("input", {bubbles: true});
  document.getElementById("promptTextInput").dispatchEvent(event);
  
});



let imageCustomizationTop = document.getElementById("imageCustomization").getBoundingClientRect().top - 60;
  document.querySelector(".sectionContainer").scrollTo({ top: imageCustomizationTop});



document.getElementById("createBtn").addEventListener("click", function() {
  
  let imageCustomizationTop = document.getElementById("imageCustomization").getBoundingClientRect().top - 60;
  document.querySelector(".sectionContainer").scrollTo({ top: imageCustomizationTop});
});


  function notify(msg)
  {
    document.getElementById("notifText").innerText = msg;
    document.getElementById("notification").classList.add("display");
    setTimeout(() => document.getElementById("notification").classList.remove("display"), 3000);
  }