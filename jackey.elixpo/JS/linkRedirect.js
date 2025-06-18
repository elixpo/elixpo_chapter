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
    const basePath = getBasePath();
    location.replace(`${basePath}/${path}`);
  }