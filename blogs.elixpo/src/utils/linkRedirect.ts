function getBasePath(): string {
  if(window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
  {
    return "";
  }
  else if (window.location.hostname === "circuit-overtime.github.io") {
    return "/Elixpo_ai_pollinations"; 
  }
  else if (window.location.hostname.endsWith(".vercel.app")) 
  {
    return ""; 
  } 
  else 
  {
    return "";
  }
  }
  
  function redirectTo(path: string): void {
  const basePath: string = getBasePath();
  location.replace(`${basePath}/${path}`);
  }
