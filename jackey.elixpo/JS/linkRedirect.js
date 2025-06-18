function getBasePath() {
  const hostname = window.location.hostname;

  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return "/jackey.elixpo";
  }
  else if (hostname === "circuit-overtime.github.io") {
    return "/jackeyBot/jackey.elixpo";
  }
  else if (hostname.endsWith(".vercel.app")) {
    return "/jackey.elixpo";  // Vercel serves from this folder
  }
  else if (hostname.endsWith(".com")) {
    return "";  // Your .com also serves from this folder
  }
  else {
    return "/jackey.elixpo";  // Fallback
  }
}

  
  function redirectTo(path) {
    const basePath = getBasePath();
    location.replace(`${basePath}/${path}`);
  }