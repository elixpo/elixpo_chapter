async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const statusElement = document.getElementById("status");
      console.log("OAuth Callback Params:", { code, state, error });
      if (error) {
        statusElement.innerHTML = `❌ GitHub authentication failed: ${error}`;
        setTimeout(() => {
          redirectTo("src/auth/login");
        }, 3000);
        return;
      }

      if (!code || state != "elixpo-blogs-github" && state!= "elixpo-blogs-google") {
        statusElement.innerHTML = "❌ Invalid GitHub OAuth callback.";
        // setTimeout(() => {
        //   redirectTo("src/auth/login");
        // }, 5000);

        return;
      }
      else if (state === "elixpo-blogs-google"){
        showNotification("Processing Google authentication...");
    
    try {
        const res = await fetch("http://localhost:5000/api/loginGoogle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code: code }),
        });

        const data = await res.json();
        if (data.status) {
            showNotification("Google login successful!");
            setTimeout(() => redirectTo("src/feed"), 1500);
        } else {
            showNotification(data.error || "Google login failed.");
            resetLoginForm();
        }
    } catch (err) {
        showNotification("Network error during Google login.");
        resetLoginForm();
        }
      }
      else if (state === "elixpo-blogs-github"){
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
        //   setTimeout(() => {
        //     redirectTo("src/auth/login");
        //   }, 3000);
        }
      } catch (err) {
        console.error("GitHub callback error:", err);
        statusElement.innerHTML = "🔥 Network error during GitHub login.";
        // setTimeout(() => {
        //   redirectTo("src/auth/login");
        // }, 3000);
      }
      }


      
    }




document.addEventListener('DOMContentLoaded', handleCallback);