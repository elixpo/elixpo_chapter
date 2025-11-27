let recommendations = [
  {
    "content" : "Working with Anwesha is like debugging with a cup of coffee—full of surprises and occasional heart palpitations. She once refactored my code and my heart at the same time. If you ever need someone to turn a bug into a feature (or a frown into a smile), she's your girl. Happy birthday Anwesha, may your commits be bug-free and your crushes reciprocated!",
    "name" : "Cupid DevOps",
    "designation" : "Love Deployment Engineer",
    "image": "https://randomuser.me/api/portraits/women/44.jpg"
  },
  {
    "content" : "Anwesha doesn’t just write code, she writes love letters in JavaScript. Her pull requests are as sweet as birthday cake, and her merge conflicts are always resolved with a smile. If falling in love was a sprint, she’d already be in production. Happy birthday to the queen of both hearts and GitHub!",
    "name" : "Heartful Reviewer",
    "designation" : "Senior Romantic Coder",
    "image": "https://randomuser.me/api/portraits/women/47.jpg"
  },
  {
    "content" : "Every time Anwesha pushes to main, my heart skips a beat. She’s the only developer who can cause a merge conflict in my feelings. On her birthday, may her code compile on the first try and her love life be as smooth as a successful npm install.",
    "name" : "Secret Admirer",
    "designation" : "Anonymous Code Enthusiast",
    "image": "https://randomuser.me/api/portraits/lego/6.jpg"
  },
  {
    "content" : "Anwesha’s portfolio is like a rom-com: full of unexpected twists, heartfelt moments, and a happy ending. She’s the only one who can debug my loneliness and refactor my sadness. Happy birthday Anwesha—may your love story be as epic as your JavaScript skills!",
    "name" : "Romantic Algorithm",
    "designation" : "Love Story Architect",
    "image": "https://randomuser.me/api/portraits/women/68.jpg"
  }
]


function appendRecommendation(recommendations)
{
    const recommendationContainer = document.getElementById('recommendationSection');

    recommendations.forEach(recommendation => {
        let recommendationTile = `
        <div id="scrollZone" class="recommendationCard shrink-0 relative h-[400px] w-[650px] border-4 border-[#222] rounded-[25px] bg-[#E2D9C8] p-5 justify-center items-center mr-5 cursor-pointer hover:brightness-[85%] transition-all duration-300 ease-in-out">
          <div class="dottedContainer relative h-full w-full border-2 border-dashed border-[#222] rounded-[30px] flex flex-col gap-5 p-10 justify-between">
            <p class="quote text-[#333] text-[1.55em] whitespace-normal break-words underline decoration-1 decoration-[0.05rem] decoration-[#888] underline-offset-[6px]"> "${(recommendation.content).slice(0,200)}..."</p>
            <div class="attribution flex flex-row items-center items-left gap-5">
              <div class="userLogo relative bg-[url(${recommendation.image})] bg-cover bg-center h-[80px] w-[80px] border-2 border-[#222] rounded-[50%] grayscale sepia-[50%]"></div>
              <div class="userInfo flex flex-col gap-1 leading-[30px]">
                <div class="userName font-extrabold text-[2.5em] relative tracking-wide"> ${recommendation.name} </div>
                <div class="userDesig font-thin text-[2em] relative"> ${recommendation.designation} </div>
              </div>
            </div>
            <div class="stamp absolute bottom-[20px] right-[20px] h-[80px] w-[80px] bg-[url(../CSS/ASSESTS/projects/stamp-2.png)] bg-cover bg-center "></div>
          </div> 
        </div>
    `;
        recommendationContainer.innerHTML += recommendationTile;
    });
    

    
}

appendRecommendation(recommendations);