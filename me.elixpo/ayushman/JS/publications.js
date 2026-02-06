// filepath: /e:/elixpo/JS/publications.js

const publications = [
    {
        title: "Exploring Microcode CPU Instructions with RISC-V Breadboard Computer",
        year: "2025",
        isNew: true
    },
    {
        title: "Decoding the Vulnerabilities of Large AI Models: Practical Demonstrations and Defensive Strategies Against Poisoning, Extraction, and Prompt Injection Attacks",
        year: "2025",
        isNew: false
    },
    {
        title: "Predictive Analysis of Autism Spectrum Disorder (ASD) Traits: Integrating Supervised Machine Learning and Exploratory Data Insights",
        year: "2024",
        isNew: false
    },
    
];

function renderPublications(publications) {
    const container = document.getElementById('publications');
    if (!container) return;

    publications.forEach(pub => {
        const pubHTML = `
            <div class="publication relative h-[60px] w-full flex flex-row items-center justify-between border-t-2 border-b-2 border-[#111] box-border px-6 py-3">
            <div class="paperName h-full flex-1 flex items-center overflow-hidden">
                <p class="paperTitle font-extrabold text-lg md:text-xl lg:text-2xl text-left tracking-[2px] p-6 truncate">
                    ${pub.title}
                </p>
            </div>

            <div class="paperDate flex flex-row gap-3 items-center flex-shrink-0">
                <p class="text-[#222] text-lg md:text-xl font-bold whitespace-nowrap">${pub.year}</p>
                ${pub.isNew ? `
                <span class="newTag flex h-[28px] px-2 text-sm md:text-base text-[#ffc] bg-[#B63B12] items-center justify-center rounded-[5px]"> 
                    <p>NEW</p> 
                </span>
                ` : ''}
                <ion-icon 
                    name="caret-forward" 
                    class="text-xl p-1 border-2 border-dashed border-[#222] rounded-full cursor-pointer hover:rotate-[25deg] transition duration-200"
                    onclick="showPaper()">
                </ion-icon>
            </div>
        </div>

        `;
        container.innerHTML += pubHTML;
    });
}

window.onload = function() {
    renderPublications(publications);
};

function showPaper() 
{
    showToast("Paper details coming soon!", 3000);
}