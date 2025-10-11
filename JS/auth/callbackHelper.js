async function handleCallback() {
    console.log("🚀 handleCallback function started");
    console.log("🔗 Current URL:", window.location.href);
    
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    
    console.log("📋 OAuth Callback Params:", { code, state, error });
    
    // Wait for UI to be initialized
    setTimeout(async () => {
        const ui = window.callbackUI;
        
        if (error) {
            console.error("OAuth Error:", error);
            if (ui) {
                ui.showError(`Authentication failed: ${error}`);
            }
            // setTimeout(() => {
            //     redirectTo("src/auth/login");
            // }, 3000);
            return;
        }

        if (!code || (state !== "elixpo-blogs-github" && state !== "elixpo-blogs-google")) {
            console.error("Invalid OAuth callback parameters");
            if (ui) {
                ui.showError("Invalid authentication callback. Please try signing in again.");
            }
            setTimeout(() => {
                redirectTo("src/auth/login");
            }, 3000);
            return;
        }


        if (state === "elixpo-blogs-google") {
            // if (ui) {
            //     ui.setLoadingState("Processing Google authentication...");
            // }
            
            // console.log("Google OAuth callback received with code:", code);
            
            // if (ui) {
            //     ui.showSuccess({
            //         name: "Google User",
            //         email: "user@gmail.com",
            //         avatar: null
            //     });
            // }
            
            // console.log("Google login successful! (Development Mode)");
            // setTimeout(() => {
            //     console.log("Redirecting to feed...");
            //     redirectTo("src/feed");
            // }, 2000);
            
            
            
            try {
                const res = await fetch("http://localhost:5000/api/loginGoogle", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ code: code }),
                });

                const data = await res.json();
                
                if (data.status) {
                    console.log("Google login successful:", data);
                    
                    if (ui) {
                        ui.showSuccess({
                            name: data.user?.name || data.user?.displayName,
                            email: data.user?.email,
                            avatar: data.user?.photoURL || data.user?.picture
                        });
                    }
                    
                    showNotification("Google login successful!");
                    setTimeout(() => redirectTo("src/feed"), 2000);
                } else {
                    console.error("Google login failed:", data);
                    
                    if (ui) {
                        ui.showError(data.error || "Google authentication failed. Please try again.");
                    }
                    
                    showNotification(data.error || "Google login failed.");
                }
            } catch (err) {
                console.error("Network error during Google login:", err);
                
                if (ui) {
                    ui.showError("Network error during Google authentication. Please check your connection.");
                }
                
                showNotification("Network error during Google login.");
            }
            
        }
        
        
        else if (state === "elixpo-blogs-github") {
            // if (ui) {
            //     ui.setLoadingState("Verifying with GitHub servers...");
            // }
            
            // // For development: Show success with mock data since GitHub OAuth needs proper client secret
            // console.log("GitHub OAuth callback received with code:", code);
            
            // if (ui) {
            //     ui.showSuccess({
            //         name: "GitHub User",
            //         email: "user@github.com",
            //         avatar: null
            //     });
            // }
            
            // console.log("GitHub login successful! (Development Mode)");
            // setTimeout(() => {
            //     console.log("Redirecting to feed...");
            //     redirectTo("src/feed");
            // }, 2000);
            
            
            
            try {
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
                    console.log("GitHub login successful:", data);
                    console.log("Login successful, checking cookies...");
                    console.log("Document cookies:", document.cookie);
                    
                    if (ui) {
                        ui.showSuccess({
                            name: data.user?.name || data.user?.login,
                            email: data.user?.email,
                            avatar: data.user?.avatar_url
                        });
                    }
                    
                    // Clean up URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    setTimeout(() => {
                        redirectTo("src/feed");
                    }, 2000);
                } else {
                    console.error("GitHub login failed:", data);
                    
                    if (ui) {
                        ui.showError(data.error || "GitHub authentication failed. Please try again.");
                    }
                }
            } catch (err) {
                console.error("GitHub callback error:", err);
                
                if (ui) {
                    ui.showError("Network error during GitHub authentication. Please check your connection.");
                }
            }
        }
    }, 100); 
}




document.addEventListener('DOMContentLoaded', handleCallback);