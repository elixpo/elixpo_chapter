
let spotlightNews = [
  {
    "title": "Anwesha's Birthday Bash",
    "date": "2025-07-06",
    "description": "It's Anwesha's birthday! 🎉 She tried to bake a cake, but the fire alarm had other plans. Still, she managed to blow out the candles (after the firemen left). Gifts, giggles, and a lot of cake crumbs everywhere.",
    "image": "../CSS/ASSESTS/spotlight/birthday-cake.png"
  },
  {
    "title": "Love at First Byte",
    "date": "2025-02-14",
    "description": "Anwesha's code wasn't the only thing compiling—her heart was too! She met a mysterious stranger at the coffee shop who debugged her JavaScript and stole her heart. Now she's writing love letters in Python.",
    "image": "../CSS/ASSESTS/spotlight/love-byte.png"
  },
  {
    "title": "Portfolio Panic",
    "date": "2025-04-01",
    "description": "Anwesha accidentally uploaded her childhood diary instead of her resume. Now recruiters know about her secret crush on her math teacher and her dream to become a unicorn. Oops!",
    "image": "../CSS/ASSESTS/spotlight/portfolio-panic.png"
  },
  {
    "title": "Falling for Bugs",
    "date": "2025-04-06",
    "description": "Debugging at midnight, Anwesha realized she was falling... for both the bugs and someone special. Turns out, love and JavaScript errors both keep her up at night. Happy endings (and semicolons) await!",
    "image": "../CSS/ASSESTS/spotlight/falling-for-bugs.png"
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
    // const appContainer = document.getElementById('appContainer');
    // const punchlineSection = document.getElementById('scrollZone');
    // if (appContainer && punchlineSection) {
    //     const appRect = appContainer.getBoundingClientRect();
    //     const punchlineRect = punchlineSection.getBoundingClientRect();
    //     const top = punchlineRect.top - appRect.top + appContainer.scrollTop;
    //     appContainer.scrollTo({ top, behavior: 'smooth' });
    // }
    // const appContainer = document.getElementById('appContainer');
    // if (appContainer) {
    //     appContainer.scrollTop = appContainer.scrollHeight;
    // }
    
}



document.getElementById("projectsRedirect").addEventListener("click", function() {
  redirectTo("projects");
});


