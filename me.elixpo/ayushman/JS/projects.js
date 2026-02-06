async function fetchGitHubData(projectURL) {
    const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    const apiUrl = isLocalhost ? "http://localhost:3004/github" : "/github";
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectURL })
    });
    if (!response.ok) {
        throw new Error('Failed to fetch GitHub data');
    }
    return await response.json();
}

function generateSVGGraph(contributions = 15) {
    let points = "";
    let circles = "";
    for (let i = 0; i <= contributions; i++) {
        const x = i * 20;
        const y = 10 + Math.floor(Math.random() * 40);
        points += `${x},${y} `;
        circles += `<circle cx="${x}" cy="${y}" r="3" fill="#2ea043"/>`;
    }

    return `
        <svg width="180" height="60" viewBox="0 0 180 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline fill="none" stroke="#66460c" stroke-width="3" points="${points.trim()}" />
            ${circles}
        </svg>
    `;
}

function renderProjectTile(data) {
    const tagHTML = data.topics.slice(0, 3).map(tag => `
        <span class="inline-flex items-center px-3 py-1 rounded-full bg-[#664600] text-[#fff] text-[0.95em] font-medium border border-[#111]">
            <ion-icon name="pricetag" class="mr-1 text-[#ffd700]"></ion-icon>${tag}
        </span>
    `).join("");

    const graphSVG = generateSVGGraph(data.contributors.length);

    return `
    <div class="project w-full flex flex-col items-center justify-center gap-1 border-b-2 border-[#222] pb-5">
        <div class="nameStateStar px-5 flex flex-row justify-between items-center w-full">
            <p class="projectName font-extrabold text-[2.3em] text-[#222] underline cursor-pointer underline-offset-[6px] decoration-[#555] transition-[0.25s] hover:text-[#66460c]" onclick="redirectToProject('${data.url}')">
                ${data.name}
            </p>
            <span class="newTag flex items-center gap-2 px-4 py-1 rounded-lg bg-[#66460c] shadow-lg">
                <p class="font-bold text-[1.1em] text-[#fff] tracking-wide drop-shadow">NEW</p>
                <ion-icon name="star" class="text-yellow-500 text-[1.5em] drop-shadow"></ion-icon>
                <p class="font-semibold text-[1.1em] text-[#fff]">${data.stars}</p>
            </span>
        </div>
        <div class="projectOwner w-full px-5 flex flex-row gap-2 justify-left items-center">
            <div class = "userLogo h-[20px] w-[20px] rounded-[50%] bg-[url(${data.ownerLogo})] bg-center bg-cover "></div>
            <p class="text-[1.2em] text-[#555] font-semibold">from ${data.owner}</p>
        </div>
        <div class="projectDescription w-full px-5 flex flex-row justify-between">
            <p class="text-[1.2em] text-[#333] font-semibold w-[70%]">${data.description || "No description provided."}</p>
            <div class="flex flex-col items-end justify-center w-[20%]" border-b-2 border-[#222]">
                ${graphSVG}
            </div>
        </div>
        <div class="projectTags w-full px-5 mt-2 flex flex-row items-left justify-left gap-2">
            ${tagHTML}
        </div>
    </div>
    `;
}

async function loadProjectTiles() {
    const container = document.getElementById("projectsContainer");
    let projects = [
        {
            projectURL : "https://github.com/Circuit-Overtime/elixpo_ai_chapter"
        },
        {
            projectURL : "https://github.com/Circuit-Overtime/CNN_Facecom_2"
        }, 
        {
            projectURL: "https://github.com/Circuit-Overtime/jackeyBot"
        },
        {
            projectURL: "https://github.com/Circuit-Overtime/elixpo-search-agent"
        },
        {
            projectURL: "https://github.com/Circuit-Overtime/terminal-ascii"
        },
        {
            projectURL: "https://github.com/Circuit-Overtime/Image_Compression"
        }, 
    ]
    for (let project of projects) {
        try {
            const data = await fetchGitHubData(project.projectURL);
            const html = renderProjectTile(data);
            container.innerHTML += html;
        } catch (err) {
            container.innerHTML += `<div class="project-error">Failed to load project: ${project.projectURL}</div>`;
        }
    }
}
function redirectToProject(url) {
    window.open(url, '_blank');
}
loadProjectTiles();
