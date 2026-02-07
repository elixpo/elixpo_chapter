function getBasePath() {
  const hostname = window.location.hostname;

  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return "/jackey.elixpo"; 
  }
  else if (hostname === "circuit-overtime.github.io") {
    return "/jackeyBot/jackey.elixpo";
  }
  else {
    return ""; 
  }
}


  
function redirectTo(path) {
  const basePath = getBasePath().replace(/\/$/, ""); 
  path = path.replace(/^\//, "");                    
  const target = path ? `${basePath}/${path}` : `${basePath}/`;
  location.replace(target);
}
