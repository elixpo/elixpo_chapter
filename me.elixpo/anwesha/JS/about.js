
const workExperiences = [
  {
    jobTitle: "Birthday Girl in Love 💖",
    timeline: "Since June 2025",
    description: `Hi, I'm Anwesha! Today is my birthday and, plot twist, I think I'm falling in love (with coding... or maybe someone special? 🤭). If you’re here, you’re already part of my story. Let’s make this portfolio a little more magical together!`
  },
  {
    jobTitle: "Professional Cake Eater",
    timeline: "June 2025 - Present",
    description: `On birthdays, calories don’t count. I’ve mastered the art of eating cake while debugging JavaScript. If you need someone who can multitask between sugar rushes and code crashes, I’m your girl!`
  },
  {
    jobTitle: "Hopeless Romantic (and Coder)",
    timeline: "2025 - Present",
    description: `I write code and love letters with equal passion. Sometimes my variables are named after my crush. If you spot a 'let heart = true;', just smile and scroll on.`
  },
  {
    jobTitle: "Chief Meme Officer",
    timeline: "2024 - Present",
    description: `I believe every project needs a meme repo. My pull requests come with a side of laughter. If you want your standups to be less boring, I’m available for hire (and for puns).`
  },
  {
    jobTitle: "Birthday Wish Granter",
    timeline: "Today Only!",
    description: `It’s my birthday, so I’m granting wishes! Want a bug fixed? A feature shipped? Or just a virtual cupcake? Drop a message and let’s make it happen.`
  },
  {
    jobTitle: "Love-struck Debugger",
    timeline: "2025",
    description: `Debugging code is easy. Debugging feelings? Not so much. If you see me staring at my screen and smiling, I’m probably thinking about you (or that one perfect for-loop).`
  },
  {
    jobTitle: "Portfolio Queen 👑",
    timeline: "Forever",
    description: `This is Anwesha’s world, and you’re just scrolling in it. Thanks for visiting my portfolio on my special day. May your bugs be few and your birthdays be sweet!`
  }
];

const workExpSection = document.getElementById('workExperience');

workExperiences.forEach(exp => {

    let workExperienceTile = `
        <div class="workExperienceCard shrink-0 relative h-[550px] w-[550px] border-4 border-[#222] rounded-[25px] bg-[#E2D9C8] p-5 justify-center items-center mr-5 cursor-grabbing brightness-[65%] hover:brightness-[85%] transition-all duration-300 ease-in-out">
        <div class="dottedContainer relative h-full w-full border-2 border-dashed border-[#222] rounded-[30px] flex flex-col gap-5 p-10">
        <div class="workInformation flex flex-row items-left gap-5 mt-5">
            <div class="userInfo flex flex-col gap-1 leading-[30px]">
            <div class="jobSpotlight font-extrabold text-[4em] relative tracking-wide leading-[60px]"> ${exp.jobTitle} </div>
            <div class="jobTimeline font-thin text-[2em] relative"> ${exp.timeline} </div>
            </div>
        </div>

        <p class="quote absolute bottom-[20px] w-[450px] text-[#333] text-[1.3em] whitespace-normal break-words underline decoration-1 decoration-[0.05rem] decoration-[#888] underline-offset-[6px]">"${exp.description}"</p>

        </div> 
        </div>  
    `

    workExpSection.innerHTML += workExperienceTile;
});


let isDown = false;
let startX;
let scrollLeft;

if (workExpSection) {
  workExpSection.addEventListener('mousedown', (e) => {
    isDown = true;
    workExpSection.classList.add('active');
    startX = e.pageX - workExpSection.offsetLeft;
    scrollLeft = workExpSection.scrollLeft;
  });

  workExpSection.addEventListener('mouseleave', () => {
    isDown = false;
    workExpSection.classList.remove('active');
  });

  workExpSection.addEventListener('mouseup', () => {
    isDown = false;
    workExpSection.classList.remove('active');
  });

  workExpSection.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - workExpSection.offsetLeft;
    const walk = (x - startX) * 1.5; // scroll-fast
    workExpSection.scrollLeft = scrollLeft - walk;
  });
}




let spotlightNews = [
    {
        "title": "Elixpo Art ",
        "date": "2025-07-06",
        "description": "A vanilla project, which integartes generative AI and art. It is a simple project that allows users to generate art using AI models. Basically an advanced TEXT2IMAGE Generator, available across all platforms",
        "image": "../CSS/ASSESTS/spotlight/elixpo-art.png"
    },
    {
        "title": "Elixpo Hackathon",
        "date": "2025-02-06",
        "description": "Hexafalls Hackathon was organized by JIS University, where I was a core-member of the organizing committee. The event was a great success, with over 300 participants and 60+ projects submitted. It was a great experience to be a part of such a large event.",
        "image": "../CSS/ASSESTS/spotlight/elixpo-hackathon.png"
    },
    {
      "title" : "Langchain Based Search",
      "date" : "2025-04-06",
      "description" : "Built on the part of Pollinations to leverage the searching algorithm for the LLMs. It can search the web dynamically using different techniques of searching and indexing, and parsing the request through an LLM for NLP.",
      "image" : "../CSS/ASSESTS/spotlight/elixpoSearchPicture.png"
    },
    {
      "title" : "ASCII Terminal Art",
      "date" : "2025-04-06",
      "description" : "This is a fun project built to display media on the terminal using ASCII art. It uses a simple algorithm to convert images into ASCII art and display them on the terminal. It is a fun project to showcase the power of ASCII art and how it can be used to display media in a different way.",
      "image" : "../CSS/ASSESTS/spotlight/asciiArt.png"
    }
]



function appendNews(spotlightNews) {
    let isDown = false;
    let startX;
    let scrollLeft;
  const spotlightContainer = document.getElementById('spotlight');
  if (!spotlightContainer) return;

  let html = '';
  const now = new Date();
  const midIndex = Math.floor(spotlightNews.length / 2);

  spotlightNews.forEach((news, index) => {
    const newsDate = new Date(news.date);
    const diffDays = Math.abs(now - newsDate) / (1000 * 60 * 60 * 24);
    const isNew = diffDays <= 7;

    const newsTile = `
      <div class="featuredTile relative h-[350px] w-[400px] flex-shrink-0 flex flex-col items-center mt-[10px]">
        <div class="featuredImage hoverScale h-[150px] w-[90%] bg-[url(${news.image})] bg-cover bg-center rounded-[12px]"></div>
        <span class="featuredName relative w-full flex flex-row px-[20px] items-center justify-between box-border">
          <p class="featureName text-left text-[1.5em]"> ${news.title} </p> 
          ${isNew ? `
            <span class="newTag relative flex h-[30px] text-[1.8em] text-[#ffc] bg-[#B63B12] items-center justify-center px-[2px] rounded-[5px] mt-[10px]"> 
              <p> NEW </p> 
            </span>` : ''}
        </span>
        <p class="featuredDescription relative text-[1.35em] text-left px-[20px] whitespace-normal break-words w-full text-ellipsis overflow-hidden">
          ${news.description.slice(0, 150)}...
        </p>
      </div>
    `;

    // Insert special tile in the middle
    if (index === midIndex) {
      html += `
        <div class="featuredTileSpecial relative h-[350px] w-[450px] flex-shrink-0 flex flex-col items-center mt-[10px] border-r-2 border-l-2 border-[#888] px-5">
          <p class="featuredTileSpecialText text-[4em] font-extrabold tracking-wide relative"> SPOTLIGHT!</p>
          <p class="featuredTileSpecialDesc text-[1.8em] font-thin relative text-center"> Welcome to the latest catches -- in my career and let's find the craziest!!</p>
          <p class="featuredTileSpecialTip relative text-[1.5em] font-extrabold text-center top-[70px]">  &lt&lt Watch! More to Come &gt&gt </p>
        </div>
      `;
    }

    html += newsTile;
  });

  spotlightContainer.innerHTML = html;

  // Center scroll to special tile
  requestAnimationFrame(() => {
    const specialTile = spotlightContainer.querySelector('.featuredTileSpecial');
    if (specialTile) {
      const scrollTo = specialTile.offsetLeft - (spotlightContainer.clientWidth / 2) + (specialTile.clientWidth / 2);
      spotlightContainer.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  });


  spotlightContainer.addEventListener('mousedown', (e) => {
    isDown = true;
    spotlightContainer.classList.add('active');
    startX = e.pageX - spotlightContainer.offsetLeft;
    scrollLeft = spotlightContainer.scrollLeft;
  });

  spotlightContainer.addEventListener('mouseleave', () => {
    isDown = false;
    spotlightContainer.classList.remove('active');
  });

  spotlightContainer.addEventListener('mouseup', () => {
    isDown = false;
    spotlightContainer.classList.remove('active');
  });

  spotlightContainer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - spotlightContainer.offsetLeft;
    const walk = (x - startX) * 1.5; // scroll-fast
    spotlightContainer.scrollLeft = scrollLeft - walk;
  });
}

  
window.onload = function() {
    appendNews(spotlightNews);
    document.getElementById("publicationVisit").addEventListener("click", function() {
      redirectTo("publications")
    });
}
