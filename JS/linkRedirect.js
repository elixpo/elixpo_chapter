function getBasePath() {
    // Determine the base path dynamically
    if(window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    {
      return "jackey.elixpo"; 
    }
    else if (window.location.hostname === "circuit-overtime.github.io") {
      return "/jackeyBot/jackey.elixpo"; 
    }
    else if (window.location.hostname.endsWith(".vercel.app")) 
    {
      return "jackey.elixpo"; 
    } 
    else 
    {
      return "jackey.elixpo"; 
    }
  }
  
  function redirectTo(path) {
    const basePath = getBasePath();
    location.replace(`${basePath}/${path}`);
  }