async function handleGitHubCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const statusElement = document.getElementById("status");
      if (error) {
        statusElement.innerHTML = `❌ GitHub authentication failed: ${error}`;
        setTimeout(() => {
          redirectTo("src/auth/login");
        }, 3000);
        return;
      }

      if (!code || state !== "elixpo-blogs-github") {
        statusElement.innerHTML = "❌ Invalid GitHub OAuth callback.";
        setTimeout(() => {
          redirectTo("src/auth/login");
        }, 3000);
        return;
      }

      try {
        statusElement.innerHTML = "🔐 Verifying with server...";
        
        const res = await fetch("http://localhost:5000/api/loginGithub", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({ code, state }),
        });

        const data = await res.json();
        
        if (data.status) {
          statusElement.innerHTML = `✅ Login successful! Welcome, ${data.user.name || data.user.email}`;
          console.log("🍪 Login successful, checking cookies...");
          console.log("🍪 Document cookies:", document.cookie);
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => {
            
            redirectTo("src/feed");
          }, 2000);
        } else {
          statusElement.innerHTML = `❌ ${data.error || "GitHub login failed"}`;
          setTimeout(() => {
            redirectTo("src/auth/login");
          }, 3000);
        }
      } catch (err) {
        console.error("GitHub callback error:", err);
        statusElement.innerHTML = "🔥 Network error during GitHub login.";
        setTimeout(() => {
          redirectTo("src/auth/login");
        }, 3000);
      }
    }




document.addEventListener('DOMContentLoaded', handleGitHubCallback);