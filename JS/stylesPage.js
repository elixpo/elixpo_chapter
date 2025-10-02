// Art Styles Page JavaScript
document.addEventListener("DOMContentLoaded", function () {
  // Art styles data with detailed information
  const artStylesData = {
    renaissance: {
      title: "Renaissance",
      origin: "Historic • 14th-17th Century",
      description:
        "The Renaissance was a cultural movement that profoundly affected European intellectual life. It emphasized realism, perspective, and human emotion.",
      characteristics: [
        "Linear perspective and realistic proportions",
        "Chiaroscuro (light and shadow techniques)",
        "Classical themes and mythology",
        "Anatomical accuracy",
        "Religious and secular subjects",
      ],
      artists: "Leonardo da Vinci, Michelangelo, Raphael, Botticelli",
      category: "historic",
    },
    baroque: {
      title: "Baroque",
      origin: "Historic • 17th-18th Century",
      description:
        "Baroque art is characterized by dramatic movement, rich colors, and emotional intensity. It emerged as a response to the Protestant Reformation.",
      characteristics: [
        "Dramatic lighting and bold contrasts",
        "Rich, vibrant colors",
        "Emotional intensity and movement",
        "Ornate and decorative elements",
        "Religious counter-reformation themes",
      ],
      artists: "Caravaggio, Peter Paul Rubens, Gian Lorenzo Bernini, Rembrandt",
      category: "historic",
    },
    impressionism: {
      title: "Impressionism",
      origin: "Historic • 19th Century",
      description:
        "Impressionism focuses on capturing light and momentary effects rather than details. Artists painted outdoors to capture natural light.",
      characteristics: [
        "Visible brushstrokes",
        "Open composition",
        "Emphasis on light and its changing qualities",
        "Ordinary subject matter",
        "Movement as a crucial element",
      ],
      artists: "Claude Monet, Pierre-Auguste Renoir, Edgar Degas, Camille Pissarro",
      category: "historic",
    },
    "art-nouveau": {
      title: "Art Nouveau",
      origin: "Historic • Late 19th Century",
      description:
        "Art Nouveau is characterized by organic, flowing lines inspired by natural forms and structures of plants and flowers.",
      characteristics: [
        "Organic, flowing lines",
        "Natural forms and motifs",
        "Decorative and ornamental",
        "Integration of art and craft",
        "Asymmetrical compositions",
      ],
      artists: "Gustav Klimt, Alphonse Mucha, Charles Rennie Mackintosh, Louis Comfort Tiffany",
      category: "historic",
    },
    abstract: {
      title: "Abstract",
      origin: "Modern • 20th Century",
      description:
        "Abstract art uses visual language of shape, form, color and line to create compositions independent of visual references in the world.",
      characteristics: [
        "Non-representational imagery",
        "Emphasis on color, form, and line",
        "Emotional expression over realism",
        "Geometric or organic abstraction",
        "Focus on pure artistic elements",
      ],
      artists: "Wassily Kandinsky, Piet Mondrian, Jackson Pollock, Mark Rothko",
      category: "modern",
    },
    surrealism: {
      title: "Surrealism",
      origin: "Modern • 20th Century",
      description:
        "Surrealism explores the unconscious mind through dreamlike imagery and unexpected juxtapositions of objects and ideas.",
      characteristics: [
        "Dreamlike and fantastical imagery",
        "Unexpected juxtapositions",
        "Automatic drawing techniques",
        "Psychological and symbolic content",
        "Challenge to rational thought",
      ],
      artists: "Salvador Dalí, René Magritte, Max Ernst, Joan Miró",
      category: "modern",
    },
    "pop-art": {
      title: "Pop Art",
      origin: "Modern • 1950s-1960s",
      description:
        "Pop Art emerged as a reaction against abstract expressionism, incorporating imagery from popular culture and mass media.",
      characteristics: [
        "Commercial and popular imagery",
        "Bright, bold colors",
        "Mass production techniques",
        "Consumer culture themes",
        "Irony and satire",
      ],
      artists: "Andy Warhol, Roy Lichtenstein, Claes Oldenburg, James Rosenquist",
      category: "modern",
    },
    minimalism: {
      title: "Minimalism",
      origin: "Modern • 1960s",
      description:
        "Minimalism strips art down to its essential elements, using simple forms, clean lines, and limited color palettes.",
      characteristics: [
        "Simplified forms and shapes",
        "Limited color palettes",
        "Clean, geometric lines",
        "Emphasis on space and light",
        "Reduction to essential elements",
      ],
      artists: "Donald Judd, Dan Flavin, Agnes Martin, Frank Stella",
      category: "modern",
    },
    cyberpunk: {
      title: "Cyberpunk",
      origin: "Digital • 1980s-Present",
      description: "Cyberpunk art features futuristic themes with neon colors, technology, and dystopian urban landscapes.",
      characteristics: [
        "Neon colors and lighting",
        "Futuristic technology themes",
        "Urban dystopian settings",
        "Digital and glitch effects",
        "High-tech, low-life aesthetic",
      ],
      artists: "Syd Mead, Moebius, Katsuhiro Otomo, Simon Stålenhag",
      category: "digital",
    },
    synthwave: {
      title: "Synthwave",
      origin: "Digital • 2000s-Present",
      description:
        "Synthwave is a retro-futuristic aesthetic inspired by 1980s culture, featuring neon grids, sunsets, and vintage computer graphics.",
      characteristics: [
        "Neon grid patterns",
        "Retro-futuristic aesthetics",
        "Vintage computer graphics",
        "Sunset and palm tree motifs",
        "Magenta and cyan color schemes",
      ],
      artists: "James White, Signalnoise, Dan Mumford, Matt Taylor",
      category: "digital",
    },
    vaporwave: {
      title: "Vaporwave",
      origin: "Digital • 2010s-Present",
      description:
        "Vaporwave is a nostalgic digital art movement featuring pastel colors, glitch effects, and retro computer aesthetics.",
      characteristics: [
        "Pastel color palettes",
        "Glitch and distortion effects",
        "Retro computer aesthetics",
        "Nostalgic imagery",
        "Marble and chrome textures",
      ],
      artists: "Macintosh Plus, Saint Pepsi, Yung Bae, Various digital artists",
      category: "digital",
    },
    "digital-painting": {
      title: "Digital Painting",
      origin: "Digital • 1990s-Present",
      description:
        "Digital painting applies traditional painting techniques using digital tools, offering unlimited creative possibilities.",
      characteristics: [
        "Traditional painting techniques",
        "Digital brushes and textures",
        "Layered composition",
        "Color blending and gradients",
        "Unlimited creative possibilities",
      ],
      artists: "Craig Mullins, Feng Zhu, Concept artists, Digital illustrators",
      category: "digital",
    },
  };

  // Get DOM elements
  const filterButtons = document.querySelectorAll(".filterBtn");
  const styleCards = document.querySelectorAll(".styleCard");
  const modal = document.getElementById("styleModal");
  const closeModalBtn = document.querySelector(".closeModal");
  const tryNowBtn = document.getElementById("tryNowBtn");

  // Filter functionality
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      // Remove active class from all buttons
      filterButtons.forEach((b) => b.classList.remove("active"));
      // Add active class to clicked button
      this.classList.add("active");

      const filter = this.dataset.filter;

      // Filter cards
      styleCards.forEach((card) => {
        const category = card.dataset.category;
        if (filter === "all" || category === filter) {
          card.classList.remove("hidden");
          card.style.display = "block";
        } else {
          card.classList.add("hidden");
          card.style.display = "none";
        }
      });
    });
  });

  // Card click functionality
  styleCards.forEach((card) => {
    card.addEventListener("click", function () {
      const styleName = this.dataset.style;
      const styleData = artStylesData[styleName];

      if (styleData) {
        openModal(styleData, styleName);
      }
    });
  });

  // Modal functionality
  function openModal(styleData, styleName) {
    const modalImg = document.getElementById("modalImg");
    const modalTitle = document.getElementById("modalTitle");
    const modalOrigin = document.getElementById("modalOrigin");
    const modalDescription = document.getElementById("modalDescription");
    const modalCharacteristics = document.getElementById("modalCharacteristics");
    const modalArtists = document.getElementById("modalArtists");

    // Set modal content
    modalImg.src = document.querySelector(`[data-style="${styleName}"] img`).src;
    modalImg.alt = styleData.title;
    modalTitle.textContent = styleData.title;
    modalOrigin.textContent = styleData.origin;
    modalOrigin.className = `modalOriginTag styleOrigin ${styleData.category}`;
    modalDescription.textContent = styleData.description;
    modalArtists.textContent = styleData.artists;

    // Set characteristics
    modalCharacteristics.innerHTML = "";
    styleData.characteristics.forEach((characteristic) => {
      const li = document.createElement("li");
      li.textContent = characteristic;
      modalCharacteristics.appendChild(li);
    });

    // Set try now button data
    tryNowBtn.dataset.style = styleName;

    // Show modal
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
  }

  // Close modal events
  closeModalBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Escape key to close modal
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // Try Now button functionality
  tryNowBtn.addEventListener("click", function () {
    const style = this.dataset.style;
    const createUrl = `../create/index.html?style=${encodeURIComponent(style)}`;
    window.location.href = createUrl;
  });

  // Smooth scroll and animation on load
  window.addEventListener("load", function () {
    // Add staggered animation to cards
    styleCards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.1}s`;
    });
  });

  // Search functionality (optional enhancement)
  function addSearchFunctionality() {
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search art styles...";
    searchInput.className = "searchInput";

    const filterSection = document.querySelector(".filterSection");
    filterSection.appendChild(searchInput);

    searchInput.addEventListener("input", function () {
      const searchTerm = this.value.toLowerCase();

      styleCards.forEach((card) => {
        const styleName = card.querySelector(".styleName").textContent.toLowerCase();
        const styleDescription = card.querySelector(".styleDescription").textContent.toLowerCase();
        const styleOrigin = card.querySelector(".styleOrigin").textContent.toLowerCase();

        if (styleName.includes(searchTerm) || styleDescription.includes(searchTerm) || styleOrigin.includes(searchTerm)) {
          card.style.display = "block";
        } else {
          card.style.display = "none";
        }
      });
    });
  }

  // Lazy loading for images
  function setupLazyLoading() {
    const images = document.querySelectorAll('img[loading="lazy"]');

    if ("IntersectionObserver" in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.classList.add("loaded");
            observer.unobserve(img);
          }
        });
      });

      images.forEach((img) => {
        imageObserver.observe(img);
      });
    }
  }

  // Initialize additional features
  setupLazyLoading();

  // Optional: Add search functionality (uncomment if needed)
  // addSearchFunctionality();

  // Performance optimization: Debounce resize events
  let resizeTimeout;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      // Handle any resize-specific logic here
    }, 150);
  });
});
