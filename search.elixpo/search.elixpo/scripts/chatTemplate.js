const SERVER_URL = "https://apisearch.elixpo.com";
lucide.createIcons();
function sectionHandler(prompt, sectionUID=null, action="create", sseText=null, finalResponse=null, sources = [], images=[])
{   
    if (!sectionUID) {
        sectionUID = generateUIDSection(prompt, Date.now());
    }

    if(action === "create")
    {
        let initialSection = `

        <section id="${sectionUID}" class="conversationSection flex flex-col items-start mt-10 w-full h-auto ">
                    <div class="query font-bold text-[2em] text-white rounded-lg break-words">
                        <p>${prompt}</p>
                    </div>
        </section>
    `
    if(document.querySelectorAll(".conversationSection").length == 0)
    {
        document.getElementById("initial-title").classList.add("hidden");
    }
    document.getElementById("conversation").insertAdjacentHTML('beforeend', initialSection);
    return sectionUID;
    }

    else if(action === "sseEvents")
    {
        document.getElementById(sectionUID).querySelectorAll(".response").forEach(el => el.remove());
        let sseEventsSection = `
        <div class="response text-lg text-white rounded-lg mt-3 break-words">
                    <div class="loader w-full h-[60px] flex flex-row gap-2 animation-rotate">
                        <ion-icon name="sparkles" class="sparkleIcon text-[#888] text-[1.2em]"></ion-icon> 
                        <p class="SSEstatus text-m text-[#888]"> ${sseText} </p>
                    </div>
        </div>
        `
        document.getElementById(sectionUID).insertAdjacentHTML('beforeend', sseEventsSection);
        return true;
    }
    else if(action === "finalResponse")
    {
        let finalResponseSection = `
        <div class="renderMarkdown w-full flex-col g-5" id="renderMarkdown">
        <div class="renderMarkdownResult_${sectionUID} text-white break-words text-[1.2em]" id="renderMarkdownResult_${sectionUID}">
                                    
        </div>
        </div>
    `
    document.getElementById(sectionUID).querySelectorAll(".response").forEach(el => el.remove());
    document.getElementById(sectionUID).insertAdjacentHTML('beforeend', finalResponseSection)
    document.getElementById(`renderMarkdownResult_${sectionUID}`).innerHTML = marked.parse(finalResponse);
    return true;
    }
    else if(action === "addSources")
    {
        let sourcesBlock = `
            <div class="sources w-full mt-2">
            <div class="sourceHeading flex flex-row gap-5 mb-2 text-[#888] ">
                <ion-icon name="book-outline" class="text-[#888] text-[1.2em]"></ion-icon>
                <span>Sources</span>
            </div>
                <div class="sourceContainers flex flex-row gap-5 flex-wrap py-2 w-full" id=sourceContainers_${sectionUID}>

                </div>
            </div>
        `
        document.getElementById(sectionUID).insertAdjacentHTML('beforeend', sourcesBlock)
        sources.forEach((source) => {
            let url;
            try {
                url = new URL(source.url);
            } catch (e) {
                url = { hostname: '' };
            }
            const domain = url.hostname;
                    fetch(`${SERVER_URL}/metadata?url=${encodeURIComponent(source.url)}`)
                        .then(response => response.json())
                        .then(data => {
                            let secondRow = data.metadata || 'No description available';
                            let sourceElement = `
                                <div class="sourceItem h-[120px] w-[250px] bg-[#222] rounded-lg py-3 px-3 flex flex-col justify-between hover:bg-[#333] cursor-pointer overflow-hidden">
                                    <div class="firstRow flex flex-row w-[99%] items-center">
                                        <div class="logoWebsite h-[20px] w-[20px] rounded-[8px] bg-cover bg-center mr-2"
                                            style="background-image: url('https://www.google.com/s2/favicons?domain=${domain}&sz=32');"></div>
                                        <span class="text-[#ccc] text-sm ml-2 truncate block max-w-[95%]" title="${source.url}">${source.url}</span>
                                    </div>
                                    <div class="secondRow text-[1em] text-[#fff] h-[60px] overflow-hidden mt-2">
                                        ${secondRow}
                                    </div>
                                </div>
                            `;
                            document.getElementById(`sourceContainers_${sectionUID}`).insertAdjacentHTML('beforeend', sourceElement);
                        })
                        .catch(() => {
                            let secondRow = 'No description available';
                            let sourceElement = `
                                <div class="sourceItem h-[120px] w-[250px] bg-[#222] rounded-lg py-3 px-3 flex flex-col justify-between hover:bg-[#333] cursor-pointer overflow-hidden" onclick="redirectPage(this)" data-url="${source.url}">
                                    <div class="firstRow flex flex-row w-[99%] items-center">
                                        <div class="logoWebsite h-[20px] w-[20px] rounded-[8px] bg-cover bg-center mr-2"
                                            style="background-image: url('https://www.google.com/s2/favicons?domain=${domain}&sz=32');"></div>
                                        <span class="text-[#ccc] text-sm ml-2 truncate block max-w-[95%]" title="${source.url}">${source.url}</span>
                                    </div>
                                    <div class="secondRow text-[1em] text-[#fff] h-[60px] overflow-hidden mt-2">
                                        ${secondRow}
                                    </div>
                                </div>
                            `;
                            document.getElementById(`sourceContainers_${sectionUID}`).insertAdjacentHTML('beforeend', sourceElement);
                        });
                });
    }
    else if(action === "addImages")
    {

        let imagesBlock = `
        <div class="images w-full mt-2 flex flex-col">
        <div class="imageHeading flex flex-row gap-5 mb-2 text-[#888] ">
            <ion-icon name="image-outline" class="text-[#888] text-[1.2em]"></ion-icon>
            <span>Images</span>
        </div>
        <div class="imageContainers flex flex-row gap-5 overflow-x-auto py-2 w-full" id="imageContainers_${sectionUID}">
           
        </div>
    </div>
    `   
    document.getElementById(sectionUID).insertAdjacentHTML('beforeend', imagesBlock)

    images.forEach((image) => {
    if (!image.url || !/[?&]h=\w+/i.test(image.url)) {
        return;
    }
    let imageElement = `
        <img src="${image.url}" alt="Image 1" class="h-[150px] w-[150px] rounded-lg bg-cover bg-center">
    `
    
    document.getElementById(`imageContainers_${sectionUID}`).insertAdjacentHTML('beforeend', imageElement)
    })
}

    
}

function redirectPage(self)
{
    let url = self.getAttribute("data-url");
    window.open(url, '_blank').focus();
}

function generateUIDSection(prompt, timestamp)
{
    const base = `${prompt}:${timestamp}:${Math.random()}`;
    let hash = 0, i, chr;
    for (i = 0; i < base.length; i++) {
        chr = base.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; 
    }
    return `secID${Math.abs(hash)}`;
}

