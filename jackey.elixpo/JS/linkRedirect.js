function getBasePath() {
  const hostname = window.location.hostname;

  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return "/jackey.elixpo";
  }
  else if (hostname === "circuit-overtime.github.io") {
    return "/jackeyBot/jackey.elixpo";
  }
  else if (hostname.endsWith(".vercel.app")) {
    return "/jackey.elixpo";  
  }
  else if (hostname.endsWith(".com")) {
    return "/jackey.elixpo"; 
  }
  else {
    return "/jackey.elixpo";  
  }
}
