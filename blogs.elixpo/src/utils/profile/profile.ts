async function checkURLParam()
{
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has("profile_set"))
    {
        let completedAt : string = urlParams.get("completedAt") || "";
        let scope : string = urlParams.get("scope") || "";
        const date = new Date();
        const time_now = date.toISOString();

        //get the params from the localstorage
        let bio : string = localStorage.getItem("entryProfile") || "";
        if(new Date(completedAt).getTime() - new Date(time_now).getTime() < 60000 && urlParams.get("profile_set"))
        {
            const entryProfileData = localStorage.getItem("entryProfile"); 
            const entries = entryProfileData ? JSON.parse(entryProfileData) : {};
            let bio = entries.bio || "";
            let displayName = entries.displayName || "";
            let profilePic = entries.profilePic || "";
            let bannerPic = entries.bannerPic || "";
            const res = await fetch("http://localhost:5000/api/checkAuth", {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ bio, displayName, profilePic, bannerPic })
            });
            const data = await res.json();
            if(data.status)
            {
                showNotification("✅ Profile updated successfully!");
                localStorage.removeItem("entryProfile");
                setTimeout(() => {
                   console.log("redirecting to dashboard");
                }, 1500);
            }

        }
    }
}

