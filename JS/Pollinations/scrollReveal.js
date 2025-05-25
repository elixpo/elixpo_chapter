document.addEventListener("DOMContentLoaded", () => {
  const sections = document.querySelectorAll("section");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const section = entry.target;

        // If section is intersecting and not already revealed
        if (entry.isIntersecting && !section.classList.contains("has-revealed")) {
          section.classList.add("is-visible", "has-revealed");

          anime({
            targets: section.children,
            opacity: [0, 1],
            translateY: [5, 0], 
            duration: 150, 
            delay: anime.stagger(10), 
            easing: "easeOutCirc" 
          });


          observer.unobserve(section);
        }
      });
    },
    {
      root: null,
      rootMargin: "0px 0px -5% 0px", 
      threshold: 0.05 
    }
  );

  sections.forEach((section) => {
    section.classList.add("is-hidden");
    observer.observe(section);
  });
});