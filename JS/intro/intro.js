class ProfileSlider {
  constructor() {
    this.currentStep = 3;
    this.totalSteps = 3;
    this.isValid = { 1: false, 2: true, 3: true };
    this.cropper = null;
    this.cropType = null;
    this.typingTimeout = null;
    this.nameCheckAbort = null;
    this.imageFilters = { // Initialize filter state
      brightness: 100,
      contrast: 100,
      saturation: 100,
      straighten: 0, // ADDED: Initial rotation/straighten value
    };
    
    const el = (selector) => document.querySelector(selector);
    this.elements = {
      steps: document.querySelectorAll('.step-content') || [],
      indicators: document.querySelectorAll('.step') || [],
      progressBar: el('#progressBar'),
      stepTitle: el('#stepTitle'),
      stepDescription: el('#stepDescription'),
      nextBtn: el('#nextBtn'),
      backBtn: el('#backBtn'),
      completeBtn: el('#completeBtn'),
      displayName: el('#displayName'),
      bio: el('#bio'),
      bioCharCount: el('#bioCharCount'),
      profilePicture: el('#profilePicture'),
      profilePicPreview: el('#profilePicPreview'),
      bannerImage: el('#bannerImage'),
      bannerPreview: el('#bannerPreview'),
      cropperModal: el('#cropperModal'),
      imageToCrop: el('#imageToCrop'),
      cancelCrop: el('#cancelCrop'),
      cropImage: el('#cropImage'),
      nameStatus: el('#nameStatus'),
      // Image Adjustment Elements
      brightnessSlider: el('#brightness-slider'),
      brightnessValue: el('#brightness-value'),
      contrastSlider: el('#contrast-slider'),
      contrastValue: el('#contrast-value'),
      saturationSlider: el('#saturation-slider'),
      saturationValue: el('#saturation-value'),
      // ADDED: Straighten elements
      straightenSlider: el('#straighten-slider'),
      straightenValue: el('#straighten-value'),
      // END ADDED
      rotateLeft: el('#rotateLeft'),
      rotateRight: el('#rotateRight'),
      resetAdjustments: el('#resetAdjustments'),
    };

    this.stepData = {
      1: {
        title: "What's your name?",
        description: "This will be your display name on LixBlogs",
        step: 1
      },
      2: {
        title: "Tell us about yourself",
        description: "Write a short bio to help others know you better (optional)",
        step: 2
      },
      3: {
        title: "Add a profile picture",
        description: "Upload a profile picture and a banner image to personalize your profile",
        step: 3
      }
    };

    this.init();
  }

  init() {
    if (!this.elements.nextBtn || !this.elements.backBtn || !this.elements.completeBtn) {
      console.warn('ProfileSlider: some core buttons are missing from DOM.');
    }
    this.createSkipButton();
    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    this.elements.nextBtn?.addEventListener('click', () => this.nextStep());
    this.elements.backBtn?.addEventListener('click', () => this.prevStep());
    this.elements.completeBtn?.addEventListener('click', () => this.completeProfile());
    this.elements.displayName?.addEventListener('input', (e) => {
      this.isValid[1] = false;
      this.updateButtons();

      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.validateDisplayName();
      }, 1000);
    });
    this.elements.bio?.addEventListener('input', () => this.updateBioCount());
    this.elements.profilePicture?.addEventListener('change', (e) => this.handleImage(e, 'pfp'));
    this.elements.bannerImage?.addEventListener('change', (e) => this.handleImage(e, 'banner'));
    this.elements.cancelCrop?.addEventListener('click', () => this.closeCropper());
    this.elements.cropImage?.addEventListener('click', () => this.crop());

    // Filter, Straighten, and Rotation Event Handlers
    this.elements.resetAdjustments?.addEventListener('click', () => this.resetImageFilters());
    this.elements.brightnessSlider?.addEventListener('input', () => this.updateImageFilter('brightness'));
    this.elements.contrastSlider?.addEventListener('input', () => this.updateImageFilter('contrast'));
    this.elements.saturationSlider?.addEventListener('input', () => this.updateImageFilter('saturation'));
    // ADDED: Straighten slider event
    this.elements.straightenSlider?.addEventListener('input', () => this.updateStraighten());
    // END ADDED
    this.elements.rotateLeft?.addEventListener('click', () => this.cropper?.rotate(-90));
    this.elements.rotateRight?.addEventListener('click', () => this.cropper?.rotate(90));
    // END: Filter and Rotation Event Handlers

    document.addEventListener('keydown', (e) => {
      const activeTag = e.target?.tagName;
      if (e.key === 'Enter' && !e.shiftKey && activeTag !== 'TEXTAREA') {
        e.preventDefault();
        if (this.currentStep === this.totalSteps && this.isValid[this.currentStep]) {
          this.completeProfile();
        } else if (this.isValid[this.currentStep]) {
          this.nextStep();
        }
      }
    });
  }

  // --- NEW METHOD: Handles the Straighten slider ---
  updateStraighten() {
    const slider = this.elements.straightenSlider;
    const valueDisplay = this.elements.straightenValue;
    
    if (!slider || !valueDisplay || !this.cropper) return;

    this.imageFilters.straighten = parseFloat(slider.value);
    valueDisplay.textContent = `${slider.value}°`;
    
    // CRITICAL: Call the Cropper.js rotateTo method to apply the new absolute angle
    this.cropper.rotateTo(this.imageFilters.straighten);
  }
  // --- END NEW METHOD ---

  // --- REVISED updateImageFilter for FINAL FIX ---
  updateImageFilter(filterName) {
    const slider = this.elements[`${filterName}Slider`];
    const valueDisplay = this.elements[`${filterName}Value`];
    const imageEl = this.elements.imageToCrop; 
    
    if (!slider || !valueDisplay || !imageEl) return;

    this.imageFilters[filterName] = parseFloat(slider.value);
    valueDisplay.textContent = `${slider.value}%`;
    
    // 1. Construct the complete CSS filter string
    const filterStyle = `
      brightness(${this.imageFilters.brightness}%) 
      contrast(${this.imageFilters.contrast}%) 
      saturation(${this.imageFilters.saturation}%)
    `.trim();

    // 2. Locate the image element being displayed by Cropper.js. 
    // This element usually has the class 'cropper-canvas'.
    // NOTE: Removed the unstable setTimeout(0).
    const cropperImage = document.querySelector('.cropper-container .cropper-canvas');

    // 3. CRITICAL: Apply the style directly, forcing it with !important.
    // Target 1: The original image element (for safety/hiding the original if visible)
    imageEl.style.setProperty('filter', filterStyle, 'important');

    // Target 2: The actual image displayed inside the Cropper wrapper
    if (cropperImage) {
        cropperImage.style.setProperty('filter', filterStyle, 'important');
    }
  }

  resetImageFilters() {
    this.imageFilters = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      straighten: 0, // ADDED: Reset straighten value
    };
    if (this.elements.imageToCrop) {
      this.elements.imageToCrop.style.filter = ''; // Reset CSS filter
    }

    // Reset sliders and value displays
    if (this.elements.brightnessSlider) {
      this.elements.brightnessSlider.value = 100;
      this.elements.brightnessValue.textContent = '100%';
    }
    if (this.elements.contrastSlider) {
      this.elements.contrastSlider.value = 100;
      this.elements.contrastValue.textContent = '100%';
    }
    if (this.elements.saturationSlider) {
      this.elements.saturationSlider.value = 100;
      this.elements.saturationValue.textContent = '100%';
    }
    
    // ADDED: Reset straighten slider and value
    if (this.elements.straightenSlider) {
      this.elements.straightenSlider.value = 0;
      this.elements.straightenValue.textContent = '0°';
    }

    // Reset rotation (both 90-degree and straighten)
    if (this.cropper) {
      this.cropper.rotateTo(0);
    }
  }
  // --- END REVISED updateImageFilter and resetImageFilters ---

  handleImage(event, type) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (this.elements.imageToCrop) {
        this.elements.imageToCrop.src = e.target.result;
        this.cropType = type;
        this.openCropper();
      } else {
        console.warn('No imageToCrop element found');
      }
    };
    reader.readAsDataURL(file);
  }

  openCropper() {
    if (!this.elements.cropperModal || !this.elements.imageToCrop) return;
    this.elements.cropperModal.classList.remove('hidden');

    // CRITICAL: Reset filters and rotation before initializing cropper
    this.elements.imageToCrop.style.filter = ''; 
    this.resetImageFilters(); 

    const aspectRatio = this.cropType === 'pfp' ? 1 : 16 / 9;
    if (this.cropper && typeof this.cropper.destroy === 'function') {
      this.cropper.destroy();
      this.cropper = null;
    }

    try {
      this.cropper = new Cropper(this.elements.imageToCrop, {
        aspectRatio,
        viewMode: 1,
        autoCropArea: 0.9,
        responsive: true,
        background: false,
        movable: true,
        zoomable: true,
        rotatable: true, 
        scalable: false,
        minContainerWidth: 200,
        minContainerHeight: 100,
        ready: () => {
          console.log('Cropper ready');
          if (this.cropper.zoomTo) {
            this.cropper.zoomTo(0);
          }
          // CRITICAL: Trigger initial filter update (sets CSS filter to 100% defaults)
          this.updateImageFilter('brightness'); 
        }
      });
    } catch (err) {
      console.error('Cropper initialization failed:', err);
      alert('Image cropper failed to load. Please try again.');
      this.closeCropper();
    }
  }

  closeCropper() {
    if (this.elements.cropperModal) this.elements.cropperModal.classList.add('hidden');
    if (this.cropper && typeof this.cropper.destroy === 'function') {
      try {
        this.cropper.destroy();
      } catch (err) {
        console.warn('Error destroying cropper', err);
      } finally {
        this.cropper = null;
      }
    }
    if (this.elements.imageToCrop) {
      this.elements.imageToCrop.src = '';
      this.elements.imageToCrop.style.filter = ''; // Cleanup filter on close
    }
  }

  // --- The corrected pixel manipulation crop() method ---
  crop() {
    if (!this.cropper) return;

    try {
        // 1. Get the cropped canvas (accounts for Cropper.js rotation and crop, including the straighten angle)
        const croppedCanvas = this.cropper.getCroppedCanvas({
            maxWidth: this.cropType === 'pfp' ? 500 : 1920,
            maxHeight: this.cropType === 'pfp' ? 500 : 1080,
            fillColor: '#fff'
        });

        let finalCanvas = croppedCanvas;

        // 2. Check if any filters were applied (non-default values)
        const filtersApplied = (
            this.imageFilters.brightness !== 100 ||
            this.imageFilters.contrast !== 100 ||
            this.imageFilters.saturation !== 100
        );

        if (filtersApplied) {
            const ctx = finalCanvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const data = imageData.data;

            // Convert percentages to multipliers/values
            const b = this.imageFilters.brightness / 100;
            const contrastFactor = this.imageFilters.contrast / 100;
            const s = this.imageFilters.saturation / 100;

            for (let i = 0; i < data.length; i += 4) {
                // 1. Get original RGB values (integer)
                let r_orig = data[i];
                let g_orig = data[i + 1];
                let b_orig = data[i + 2];
                
                // 2. --- BRIGHTNESS ---
                let r_bright = r_orig * b;
                let g_bright = g_orig * b;
                let b_bright = b_orig * b;

                // 3. --- CONTRAST ---
                // Operate on the result of Brightness
                let r_contrast = (r_bright - 128) * contrastFactor + 128;
                let g_contrast = (g_bright - 128) * contrastFactor + 128;
                let b_contrast = (b_bright - 128) * contrastFactor + 128;

                // 4. --- SATURATION (Luma/Grayscale calculation) ---
                // Calculate luma from the contrast-adjusted colors
                const luma = 0.299 * r_contrast + 0.587 * g_contrast + 0.114 * b_contrast;
                
                // Interpolate between Luma (grayscale) and the contrast-adjusted color (r_contrast)
                let r_final = luma * (1 - s) + r_contrast * s;
                let g_final = luma * (1 - s) + g_contrast * s;
                let b_final = luma * (1 - s) + b_contrast * s;

                // 5. Clamp values to ensure they stay within 0-255 range and assign back
                data[i] = Math.max(0, Math.min(255, r_final));
                data[i + 1] = Math.max(0, Math.min(255, g_final));
                data[i + 2] = Math.max(0, Math.min(255, b_final));
            }

            // Put the modified pixel data back onto the canvas
            ctx.putImageData(imageData, 0, 0);
        }

        // 3. Get the data URL from the filtered (or unfiltered if defaults) canvas
        const croppedImageUrl = finalCanvas.toDataURL('image/jpeg', 0.9);

        // 4. Update the preview elements
        if (this.cropType === 'pfp') {
            if (this.elements.profilePicPreview) {
                this.elements.profilePicPreview.innerHTML = `
                    <img src="${croppedImageUrl}" alt="Profile Picture" class="w-full h-full object-cover rounded-full" />
                `;
            }
        } else if (this.cropType === 'banner') {
            if (this.elements.bannerPreview) {
                this.elements.bannerPreview.style.backgroundImage = `url("${croppedImageUrl}")`;
                this.elements.bannerPreview.innerHTML = '';
            }
        }

        this.closeCropper();
    } catch (err) {
        console.error('Crop failed:', err);
        alert('Failed to crop image. Please try again.');
    }
  }
  
  // (Rest of the original methods like validateDisplayName, updateBioCount, etc. are included below)

  async validateDisplayName() {
    const name = this.elements.displayName?.value?.trim() ?? '';
    const nameStatusEl = this.elements.nameStatus;

    if (!nameStatusEl) {
      console.warn('nameStatus element missing in DOM');
    }

    if (nameStatusEl) nameStatusEl.innerHTML = '';

    if (name.length === 0) {
      this.isValid[1] = false;
      if (nameStatusEl) nameStatusEl.innerHTML = '';
      this.updateButtons();
      return;
    }
    if (name.length < 6) {
      this.isValid[1] = false;
      if (nameStatusEl) {
        nameStatusEl.innerHTML = `
          <ion-icon name="warning-outline" class="text-yellow-500 mt-[10px] mr-[5px]"></ion-icon>
          <span class="text-yellow-500 mt-[10px] mr-[5px]">Name must be at least 6 characters</span>`;
      }
      this.updateButtons();
      return;
    }
    if (name.length > 20) {
      this.isValid[1] = false;
      if (nameStatusEl) {
        nameStatusEl.innerHTML = `
          <ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon>
          <span class="text-red-500 mt-[10px] mr-[5px]">Name must be less than 20 characters</span>`;
      }
      this.updateButtons();
      return;
    }

    if (this.nameCheckAbort) {
      try { this.nameCheckAbort.abort(); } catch (e) {}
      this.nameCheckAbort = null;
    }
    this.nameCheckAbort = new AbortController();
    const signal = this.nameCheckAbort.signal;

    if (nameStatusEl) {
      nameStatusEl.innerHTML = `
        <ion-icon name="sync-outline" class="animate-spin mt-[10px] mr-[5px]"></ion-icon>
        <span class="mt-[10px] mr-[5px]">Checking...</span>`;
    }
    try {
      const [available, message, suggestion] = await checkNameAvailability(name, { signal });
      if (!available) {
        this.isValid[1] = false;
        if (nameStatusEl) {
          const suggestText = suggestion && suggestion !== name ? `... How about <strong>${suggestion}</strong>?` : '';
          nameStatusEl.innerHTML = `
            <ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon>
            <span class="text-red-500 mt-[10px] mr-[5px]">${message} ${suggestText}</span>`;
        }
      } else {
        this.isValid[1] = true;
        if (nameStatusEl) {
          nameStatusEl.innerHTML = `
            <ion-icon name="checkmark-circle-outline" class="text-green-500 mt-[10px] mr-[5px]"></ion-icon>
            <span class="text-green-500 mt-[10px] mr-[5px]">${message}</span>`;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Ignore aborted requests
      console.error('Name availability check failed:', err);
      this.isValid[1] = false;
      if (nameStatusEl) {
        nameStatusEl.innerHTML = `
          <ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon>
          <span class="text-red-500 mt-[10px] mr-[5px]">Server error. Try again later.</span>`;
      }
    } finally {
      this.updateButtons();
    }
  }

  updateBioCount() {
    const bioEl = this.elements.bio;
    const countEl = this.elements.bioCharCount;
    if (!bioEl || !countEl) return;

    const bio = bioEl.value || '';
    countEl.textContent = bio.length;

    const parent = countEl.parentElement;
    if (bio.length !== 0 && bio.length < 10) {
      this.isValid[2] = false;
      parent?.classList.add('text-red-500');
      parent?.classList.remove('text-slate-500');
    } else if (bio.length > 150) {
      this.isValid[2] = false;
      parent?.classList.add('text-red-500');
      parent?.classList.remove('text-slate-500');
    } else {
      this.isValid[2] = true;
      parent?.classList.remove('text-red-500');
      parent?.classList.add('text-slate-500');
    }

    this.updateButtons();
  }

  nextStep() {
    if (this.currentStep < this.totalSteps && this.isValid[this.currentStep]) {
      this.currentStep++;
      this.updateUI();
      this.animateStep();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.updateUI();
      this.animateStep();
    }
  }

  updateUI() {
    let progress = 0;
    if (this.totalSteps > 1) {
      progress = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
    } else {
      progress = 100;
    }
    if (this.elements.progressBar) this.elements.progressBar.style.width = `${progress}%`;

    const stepInfo = this.stepData[this.currentStep] || {};
    if (this.elements.stepTitle) this.elements.stepTitle.textContent = stepInfo.title || '';
    if (this.elements.stepDescription) this.elements.stepDescription.textContent = stepInfo.description || '';
    this.elements.steps.forEach((stepEl, index) => {
      const shouldShow = index + 1 === this.currentStep;
      stepEl.classList.toggle('hidden', !shouldShow);
    });

    this.updateButtons();
  }

  updateButtons() {
    if (this.currentStep === 1) {
      this.elements.backBtn?.classList.add('hidden');
    } else {
      this.elements.backBtn?.classList.remove('hidden');
    }

    if (this.currentStep === this.totalSteps) {
      this.elements.nextBtn?.classList.add('hidden');
      this.elements.completeBtn?.classList.remove('hidden');
      this.elements.completeBtn.disabled = !this.isValid[this.currentStep];

      const hasPfp = !!this.elements.profilePicPreview?.querySelector('img');
      const bannerStyle = this.elements.bannerPreview?.style?.backgroundImage || '';
      const hasBanner = bannerStyle && bannerStyle !== 'none' && bannerStyle !== '';
      if (!hasPfp && !hasBanner) {
        this.showSkipButton(true);
      } else {
        this.showSkipButton(false);
      }

      this.elements.completeBtn?.classList.remove('hidden');
      this.elements.completeBtn.disabled = !this.isValid[this.currentStep];
    } else {
      this.elements.nextBtn?.classList.remove('hidden');
      this.elements.completeBtn?.classList.add('hidden');
      this.showSkipButton(false);
      if (this.elements.nextBtn) {
        this.elements.nextBtn.disabled = !this.isValid[this.currentStep];
      }
    }
  }

  animateStep() {
    const currentStepElement = document.querySelector(`[data-step="${this.currentStep}"]`);
    if (!currentStepElement) return;

    const formGroup = currentStepElement.querySelector('.form-group');
    if (formGroup) {
      formGroup.style.animation = 'none';
      // small timeout to reflow so CSS animation can replay
      setTimeout(() => {
        formGroup.style.animation = 'slideInUp 0.6s ease-out both';
      }, 50);
    }

    setTimeout(() => {
      if (this.currentStep === 1) this.elements.displayName?.focus();
      else if (this.currentStep === 2) this.elements.bio?.focus();
    }, 300);
  }

  async completeProfile(options = {}) {
    const skipImages = !!options.skipImages;

    if (!this.isValid[1]) {
      alert('Please fix the name before completing profile.');
      return;
    }

    const formData = new FormData();
    formData.append('displayName', this.elements.displayName?.value?.trim() ?? '');
    formData.append('bio', this.elements.bio?.value?.trim() ?? '');

    const pfpImg = this.elements.profilePicPreview?.querySelector('img')?.src;
    if (pfpImg && !skipImages) formData.append('profilePicture', pfpImg);

    const bannerStyle = this.elements.bannerPreview?.style?.backgroundImage || '';
    const bannerImage = bannerStyle ? bannerStyle.slice(4, -1).replace(/"/g, "") : '';
    if (bannerImage && !skipImages) formData.append('bannerImage', bannerImage);

    if (this.elements.completeBtn) {
      this.elements.completeBtn.disabled = true;
      this.elements.completeBtn.innerHTML = `
        <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
        <span>Creating Profile...</span>
      `;
    }

    if (this.elements.skipBtn) {
      this.elements.skipBtn.disabled = true;
      this.elements.skipBtn.innerHTML = 'Skipping...';
    }

    setTimeout(() => {
      const entries = {};
      formData.forEach((value, key) => { entries[key] = value; });
      console.log('Profile completed (simulated):', entries);

      if (this.elements.completeBtn) {
        this.elements.completeBtn.disabled = false;
        this.elements.completeBtn.innerHTML = 'Complete Profile';
      }
      if (this.elements.skipBtn) {
        this.elements.skipBtn.disabled = false;
        this.elements.skipBtn.innerHTML = 'Skip';
      }

      alert(`Profile ${skipImages ? 'skipped images and ' : ''}created (simulated). Check console for details.`);
    }, 1000);
  }

  createSkipButton() {
    if (!this.elements.completeBtn) return;

    if (this.elements.skipBtn) return;

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.id = 'skipBtn';
    skipBtn.className = 'skip-btn bg-slate-500/60 text-white border-none rounded-xl px-6 py-3 cursor-pointer text-sm font-semibold flex items-center gap-2 transition-all duration-300 ease-in-out hover:bg-slate-600 hidden';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => this.completeProfile({ skipImages: true }));

    const parent = this.elements.completeBtn.parentElement || this.elements.completeBtn.parentNode;
    if (parent) {
      parent.insertBefore(skipBtn, this.elements.completeBtn);
      this.elements.skipBtn = skipBtn;
    }
  }

  showSkipButton(show) {
    if (!this.elements.skipBtn) return;
    if (show) {
      this.elements.skipBtn.classList.remove('hidden');
    } else {
      this.elements.skipBtn.classList.add('hidden');
    }
  }
}

async function checkNameAvailability(name, options = {}) {
  try {

    const response = await fetch("http://localhost:5000/api/checkUsername", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
      signal: options.signal
    });

    if (!response.ok) {
      console.warn('Name check response not ok', response.status);
      return [false, "Server error. Try again later.", ""];
    }

    const result = await response.json();
    return [!!result.available, result.message || (result.available ? 'The Username is Available' : 'Oops! The Username is Unavailable'), result.suggestion || ""];
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Name check aborted');
      throw error;
    }
    console.error("Error checking name availability:", error);
    return [false, "Server error. Try again later.", ""];
  }
}
document.addEventListener('DOMContentLoaded', () => {
  new ProfileSlider();
});