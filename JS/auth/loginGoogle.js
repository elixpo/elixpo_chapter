const clientId = "796328864956-hn8dcs3t1i3kui6qd8pvhhblj5c8c66k.apps.googleusercontent.com";

      function handleCredentialResponse(response) {
        const idToken = response.credential;
        fetch("http://localhost:5000/api/googleLogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ idToken })
        })
        .then(res => res.json())
        .then(data => {
          if (data.status) {
            console.log("Google Login Successful");
            redirectTo("src/feed");
          } else {
            alert(data.error || "Google login failed.");
          }
        })
        .catch(() => alert("Network error during Google login."));
      }

      window.onload = function () {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse
        });

        
      };
      document.getElementById("loginGoogle").addEventListener("click", () => {
          google.accounts.id.prompt(); 
        });