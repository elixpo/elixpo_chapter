class ProfileSlider {
  constructor() {
    this.currentStep = 3;
    this.totalSteps = 3;
    this.isValid = { 1: false, 2: true, 3: true };
    this.cropper = null;
    this.cropType = null;
    this.typingTimeout = null;
    this.nameCheckAbort = null;
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
      skipBtn: el('#skipBtn'),
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
      nameStatus: el('#nameStatus')
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
    this.elements.skipBtn?.addEventListener('click', () => this.completeProfile());
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
        rotatable: false,
        scalable: false,
        minContainerWidth: 200,
        minContainerHeight: 100,
        ready: () => {
          console.log('Cropper ready');
          if (this.cropper.zoomTo) {
            this.cropper.zoomTo(0);
          }
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
    if (this.elements.imageToCrop) this.elements.imageToCrop.src = '';
  }

  crop() {
    if (!this.cropper) return;
    try {
      const canvas = this.cropper.getCroppedCanvas({
        maxWidth: this.cropType === 'pfp' ? 500 : 1920,
        maxHeight: this.cropType === 'pfp' ? 500 : 1080,
        fillColor: '#fff'
      });

      const croppedImageUrl = canvas.toDataURL('image/jpeg', 0.9);

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

  
  async validateDisplayName(stepRedirect=null) {
    this.currentStep = 1;
    this.updateUI();
    this.animateStep();
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
        if(stepRedirect)
        {
          this.currentStep = stepRedirect;
          this.updateUI();
          this.animateStep();
        }
        if (nameStatusEl) {
          nameStatusEl.innerHTML = `
            <ion-icon name="checkmark-circle-outline" class="text-green-500 mt-[10px] mr-[5px]"></ion-icon>
            <span class="text-green-500 mt-[10px] mr-[5px]">${message}</span>`;
        }
      }
    } catch (err) {
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

  updateBioCount(stepRedirect=null) {
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
      if(stepRedirect)
      {
        this.currentStep = stepRedirect;
        this.updateUI();
        this.animateStep();
      }
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
    this.validateDisplayName(stepRedirect=3);
    this.updateBioCount(stepRedirect=3);
    if (this.isValid[1] && this.isValid[2] && this.isValid[3]) {
      const formData = new FormData();
      formData.append('displayName', this.elements.displayName?.value?.trim() ?? '');
      formData.append('bio', this.elements.bio?.value?.trim() ?? '');
      const pfpImg = this.elements.profilePicPreview?.querySelector('img')?.src;
      
    }
    


    // const formData = new FormData();
    // formData.append('displayName', this.elements.displayName?.value?.trim() ?? '');
    // formData.append('bio', this.elements.bio?.value?.trim() ?? '');

    // const pfpImg = this.elements.profilePicPreview?.querySelector('img')?.src;
    // if (pfpImg && !skipImages) formData.append('profilePicture', pfpImg);

    // const bannerStyle = this.elements.bannerPreview?.style?.backgroundImage || '';
    // const bannerImage = bannerStyle ? bannerStyle.slice(4, -1).replace(/"/g, "") : '';
    // if (bannerImage && !skipImages) formData.append('bannerImage', bannerImage);

    // if (this.elements.completeBtn) {
    //   this.elements.completeBtn.disabled = true;
    //   this.elements.completeBtn.innerHTML = `
    //     <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
    //     <span>Creating Profile...</span>
    //   `;
    // }

    // if (this.elements.skipBtn) {
    //   this.elements.skipBtn.disabled = true;
    //   this.elements.skipBtn.innerHTML = 'Skipping...';
    // }

    // setTimeout(() => {
    //   const entries = {};
    //   formData.forEach((value, key) => { entries[key] = value; });
    //   console.log('Profile completed (simulated):', entries);

    //   if (this.elements.completeBtn) {
    //     this.elements.completeBtn.disabled = false;
    //     this.elements.completeBtn.innerHTML = 'Complete Profile';
    //   }
    //   if (this.elements.skipBtn) {
    //     this.elements.skipBtn.disabled = false;
    //     this.elements.skipBtn.innerHTML = 'Skip';
    //   }

    //   alert(`Profile ${skipImages ? 'skipped images and ' : ''}created (simulated). Check console for details.`);
    // }, 1000);
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
