function sectionHandler(prompt, sectionUID=null, action="create")
{   
    if (!sectionUID) {
        sectionUID = generateUIDSection(prompt, Date.now());
    }

    if(action === "create")
    {
        let initialSection = `

        <section id="${sectionUID}" class="conversationSection flex flex-col items-start mt-10 w-full h-auto ">
                    <div class="query font-bold text-[2em] text-white p-3 rounded-lg break-words">
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

