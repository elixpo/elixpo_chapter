(function() {
  const container = document.getElementById("appContainer");
  if (!container) return;

  // Save scroll position before unload
  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem("appContainerScroll", container.scrollTop);
  });

  // Restore scroll position on load
  window.addEventListener("load", () => {
    const scrollY = sessionStorage.getItem("appContainerScroll");
    if (scrollY !== null) {
      container.scrollTop = parseInt(scrollY, 10);
    }
  });
})();
