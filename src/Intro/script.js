document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("profileForm");
  const displayNameInput = document.getElementById("displayName");
  const bioTextarea = document.getElementById("bio");
  const bioCharCount = document.getElementById("bioCharCount");
  const profilePictureInput = document.getElementById("profilePicture");
  const profilePicPreview = document.getElementById("profilePicPreview");
  const nameStatus = document.getElementById("nameStatus");
  const nameSuggestions = document.getElementById("nameSuggestions");
  const completeBtn = document.getElementById("completeBtn");
  const loadingOverlay = document.getElementById("loadingOverlay");

  let nameCheckTimeout;
  let isNameAvailable = false;

  // Bio character counter
  bioTextarea.addEventListener("input", function () {
    const currentLength = this.value.length;
    bioCharCount.textContent = currentLength;

    if (currentLength > 150) {
      bioCharCount.style.color = "#e74c3c";
    } else if (currentLength > 120) {
      bioCharCount.style.color = "#f39c12";
    } else {
      bioCharCount.style.color = "#666";
    }
  });

  // Profile picture preview
  profilePictureInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        alert("Please select an image smaller than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        profilePicPreview.innerHTML = `<img src="${e.target.result}" alt="Profile Picture">`;
        profilePicPreview.classList.add("pulse");
        setTimeout(() => profilePicPreview.classList.remove("pulse"), 300);
      };
      reader.readAsDataURL(file);
    }
  });

  // Display name validation and checking
  displayNameInput.addEventListener("input", function () {
    const name = this.value.trim();

    // Clear previous timeout
    clearTimeout(nameCheckTimeout);

    // Clear previous status
    nameStatus.innerHTML = "";
    nameSuggestions.innerHTML = "";
    isNameAvailable = false;
    updateCompleteButton();

    if (name.length === 0) {
      return;
    }

    if (name.length < 2) {
      showNameStatus("Name must be at least 2 characters long", "error");
      return;
    }

    // Show checking status with inline spinner
    showNameStatus('<span class="checking-spinner"></span> Checking availability...', "checking");

    // Debounce the check
    nameCheckTimeout = setTimeout(async () => {
      try {
        const result = await window.bloomFilter.checkNameAvailability(name);

        if (result.available) {
          showNameStatus("✓ Name is available!", "available");
          isNameAvailable = true;
        } else {
          showNameStatus(`✗ ${result.reason}`, "taken");
          isNameAvailable = false;

          if (result.suggestions && result.suggestions.length > 0) {
            showSuggestions(result.suggestions);
          }
        }

        updateCompleteButton();
      } catch (error) {
        showNameStatus("Error checking name availability", "error");
        console.error("Name check error:", error);
      }
    }, 500);
  });

  // Form submission
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!isNameAvailable) {
      alert("Please choose an available display name");
      return;
    }

    const formData = {
      displayName: displayNameInput.value.trim(),
      bio: bioTextarea.value.trim(),
      profilePicture: profilePictureInput.files[0],
    };

    completeProfile(formData);
  });

  // Helper functions
  function showNameStatus(message, type) {
    nameStatus.className = `name-status ${type}`;
    nameStatus.innerHTML = message;
  }

  function showSuggestions(suggestions) {
    nameSuggestions.innerHTML = '<p style="font-size: 14px; color: #666; margin-bottom: 10px;">Try these suggestions:</p>';

    suggestions.forEach((suggestion) => {
      const suggestionElement = document.createElement("span");
      suggestionElement.className = "suggestion-item";
      suggestionElement.textContent = suggestion;
      suggestionElement.addEventListener("click", () => {
        displayNameInput.value = suggestion;
        displayNameInput.dispatchEvent(new Event("input"));
      });
      nameSuggestions.appendChild(suggestionElement);
    });
  }

  function updateCompleteButton() {
    const hasName = displayNameInput.value.trim().length > 0;
    completeBtn.disabled = !(hasName && isNameAvailable);
  }

  function completeProfile(formData) {
    showLoading(true);

    // Simulate profile creation and register username
    setTimeout(async () => {
      try {
        // Register username with backend bloom filter
        const registerResponse = await fetch("http://localhost:3001/api/register-username", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username: formData.displayName }),
        });

        if (registerResponse.ok) {
          console.log("Username registered with backend bloom filter");
        } else {
          console.warn("Failed to register username with backend");
        }
      } catch (error) {
        console.warn("Error registering username:", error);
      }

      console.log("Profile data:", formData);

      // Add the name to local bloom filter as well
      console.log("Profile completed successfully");

      showLoading(false);

      // Show success message
      const container = document.querySelector(".container");
      container.innerHTML = `
                <div class="success-message" style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px; color: #27ae60; margin-bottom: 20px;">
                        <ion-icon name="checkmark-circle"></ion-icon>
                    </div>
                    <h2 style="color: #333; margin-bottom: 15px;">Profile Complete!</h2>
                    <p style="color: #666; margin-bottom: 30px;">Welcome to LixBlogs, ${formData.displayName}!</p>
                    <button onclick="redirectToHome()" class="complete-btn" style="margin: 0 auto;">
                        <span>Start Blogging</span>
                        <ion-icon name="arrow-forward"></ion-icon>
                    </button>
                </div>
            `;
    }, 2000);
  }

  // Global functions
  window.skipProfile = function () {
    if (confirm("Are you sure you want to skip profile setup? You can complete it later from your account settings.")) {
      redirectToHome();
    }
  };

  window.redirectToHome = function () {
    // In a real implementation, this would redirect to the main application
    window.location.href = "../index.html";
  };

  // Initialize form validation
  updateCompleteButton();

  // Add some entrance animations
  setTimeout(() => {
    document.querySelector(".welcome-section").style.opacity = "1";
    document.querySelector(".welcome-section").style.transform = "translateY(0)";
  }, 100);
});

// Utility functions for name validation
function generateRandomSuffix() {
  return Math.floor(Math.random() * 9999) + 1;
}

function isValidDisplayName(name) {
  // Check length
  if (name.length < 2 || name.length > 20) {
    return false;
  }

  // Check characters (letters, numbers, underscores only)
  const validPattern = /^[a-zA-Z0-9_]+$/;
  return validPattern.test(name);
}

// Add some entrance styles
document.addEventListener("DOMContentLoaded", function () {
  const welcomeSection = document.querySelector(".welcome-section");
  if (welcomeSection) {
    welcomeSection.style.opacity = "0";
    welcomeSection.style.transform = "translateY(20px)";
    welcomeSection.style.transition = "all 0.6s ease";
  }
});
