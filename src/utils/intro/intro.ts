import Cropper from 'cropperjs';

class ProfileSlider {
  currentStep: number;
  totalSteps: number;
  isValid: { [key: number]: boolean };
  cropper: any;
  cropType: string | null;
  typingTimeout: any;
  nameCheckAbort: AbortController | null;
  imageFilters: {
    brightness: number;
    contrast: number;
    saturation: number;
    straighten: number;
  };
  elements: any;
  stepData: any;

  constructor() {
    this.currentStep = 1;
    this.totalSteps = 1;
    this.isValid = { 1: false, 2: true, 3: true };
    this.cropper = null;
    this.cropType = null;
    this.typingTimeout = null;
    this.nameCheckAbort = null;
    this.imageFilters = { 
      brightness: 100,
      contrast: 100,
      saturation: 100,
      straighten: 0, 
    };
    
    const el = (selector : any) => document.querySelector(selector);
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
      brightnessSlider: el('#brightness-slider'),
      brightnessValue: el('#brightness-value'),
      contrastSlider: el('#contrast-slider'),
      contrastValue: el('#contrast-value'),
      saturationSlider: el('#saturation-slider'),
      saturationValue: el('#saturation-value'),
      straightenSlider: el('#straighten-slider'),
      straightenValue: el('#straighten-value'),
      rotateLeft: el('#rotateLeft'),
      rotateRight: el('#rotateRight'),
      resetAdjustments: el('#resetAdjustments'),
    };

    this.stepData = {
      1: {
        title: "What's your name?",
        description: "This will be your display name on LixBlogs",
        step: 1,
        mandatory: true
      },
      2: {
        title: "Tell us about yourself",
        description: "Write a short bio to help others know you better (optional)",
        step: 2,
        mandatory: false
      },
      3: {
        title: "Add a profile picture",
        description: "Upload a profile picture and a banner image to personalize your profile",
        step: 3,
        mandatory: false
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
    this.elements.displayName?.addEventListener('input', () => {
      this.isValid[1] = false;
      this.updateButtons();

      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.validateDisplayName();
      }, 1000);
    });
    this.elements.bio?.addEventListener('input', () => this.updateBioCount());
    this.elements.profilePicture?.addEventListener('change', (e : Event) => this.handleImage(e, 'pfp'));
    this.elements.bannerImage?.addEventListener('change', (e : Event) => this.handleImage(e, 'banner'));
    this.elements.cancelCrop?.addEventListener('click', () => this.closeCropper());
    this.elements.cropImage?.addEventListener('click', () => this.crop());
    this.elements.resetAdjustments?.addEventListener('click', () => this.resetImageFilters());
    if (this.elements.brightnessSlider) {
      this.elements.brightnessSlider.step = "1";
      this.elements.brightnessSlider.addEventListener('input', () => this.updateImageFilter('brightness'));
    }
    if (this.elements.contrastSlider) {
      this.elements.contrastSlider.step = "1";
      this.elements.contrastSlider.addEventListener('input', () => this.updateImageFilter('contrast'));
    }
    if (this.elements.saturationSlider) {
      this.elements.saturationSlider.step = "1";
      this.elements.saturationSlider.addEventListener('input', () => this.updateImageFilter('saturation'));
    }
    if (this.elements.straightenSlider) {
      this.elements.straightenSlider.step = "0.5";
      this.elements.straightenSlider.addEventListener('input', () => this.updateStraighten());
    }
    this.elements.rotateLeft?.addEventListener('click', () => this.cropper?.rotate(-90));
    this.elements.rotateRight?.addEventListener('click', () => this.cropper?.rotate(90));
    document.addEventListener('keydown', (e) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
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

  updateStraighten() {
    const slider = this.elements.straightenSlider;
    const valueDisplay = this.elements.straightenValue;
    if (!slider || !valueDisplay || !this.cropper) return;
    this.imageFilters.straighten = parseFloat(slider.value);
    if (!valueDisplay.querySelector('input')) {
      const currentValue = this.imageFilters.straighten;
      const inputField = document.createElement('input');
      inputField.type = 'number';
      inputField.min = slider.min;
      inputField.max = slider.max;
      inputField.step = "0.5";
      inputField.value  = currentValue.toString();
      inputField.className = 'w-12 h-5 bg-slate-700 text-blue-400 text-xs font-mono text-center rounded border border-slate-600 focus:border-blue-500 focus:outline-none';
      inputField.addEventListener('input', (e) => {
        let newValue = parseFloat((e.target as HTMLInputElement).value);
        newValue = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), newValue));
        slider.value = newValue;
        this.imageFilters.straighten = newValue;
        if (this.cropper) {
          this.cropper.rotateTo(newValue);
        }
      });
      valueDisplay.textContent = '';
      valueDisplay.appendChild(inputField);
      const degreeSign = document.createElement('span');
      degreeSign.textContent = '°';
      degreeSign.className = 'text-xs text-blue-400 font-mono ml-0.5';
      valueDisplay.appendChild(degreeSign);
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'ml-2 text-xs text-slate-400 hover:text-blue-400 transition-colors';
      resetBtn.innerHTML = '<ion-icon name="refresh-outline" class="text-xs"></ion-icon>';
      resetBtn.title = 'Reset straighten to default';
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.imageFilters.straighten = 0;
        slider.value = "0";
        inputField.value = "0";
        if (this.cropper) {
          this.cropper.rotateTo(0);
        }
      });
      valueDisplay.appendChild(resetBtn);
    } else {
      const inputField = valueDisplay.querySelector('input');
      if (inputField) {
        inputField.value = this.imageFilters.straighten;
      }
    }
    if (this.cropper) {
      this.cropper.rotateTo(this.imageFilters.straighten);
    }
  }

  updateImageFilter(filterName: keyof ProfileSlider['imageFilters']) {
    const slider = this.elements[`${filterName}Slider`];
    const valueDisplay = this.elements[`${filterName}Value`];
    const imageEl = this.elements.imageToCrop; 
    if (!slider || !valueDisplay || !imageEl) return;
    this.imageFilters[filterName] = parseFloat(slider.value) as number;
    if (!valueDisplay.querySelector('input')) {
      const currentValue = this.imageFilters[filterName];
      const inputField = document.createElement('input');
      inputField.type = 'number';
      inputField.min = slider.min;
      inputField.max = slider.max;
      inputField.step = "1";
      inputField.value = currentValue.toString();
      inputField.className = 'w-10 h-5 bg-slate-700 text-blue-400 text-xs font-mono text-center rounded border border-slate-600 focus:border-blue-500 focus:outline-none';
      inputField.addEventListener('input', (e) => {
        let newValue = parseFloat((e.target as HTMLInputElement).value);
        newValue = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), newValue));
        slider.value = newValue.toString();
        this.imageFilters[filterName] = newValue;
        this.applyImageFilters();
      });
      valueDisplay.textContent = '';
      valueDisplay.appendChild(inputField);
      const percentSign = document.createElement('span');
      percentSign.textContent = '%';
      percentSign.className = 'text-xs text-blue-400 font-mono ml-0.5';
      valueDisplay.appendChild(percentSign);
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'ml-2 text-xs text-slate-400 hover:text-blue-400 transition-colors';
      resetBtn.innerHTML = '<ion-icon name="refresh-outline" class="text-xs"></ion-icon>';
      resetBtn.title = `Reset ${filterName} to default`;
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const defaultValue = filterName === 'brightness' || filterName === 'contrast' ? 100 : 
                            filterName === 'saturation' ? 100 : 0;
        this.imageFilters[filterName] = defaultValue;
        slider.value = defaultValue.toString();
        inputField.value = defaultValue.toString();
        this.applyImageFilters();
      });
      valueDisplay.appendChild(resetBtn);
    } else {
      const inputField = valueDisplay.querySelector('input');
      if (inputField) {
        inputField.value = this.imageFilters[filterName];
      }
    }
    this.applyImageFilters();
  }
  
  applyImageFilters() {
    const imageEl = this.elements.imageToCrop;
    if (!imageEl) return;
    const filterStyle = `
      brightness(${this.imageFilters.brightness}%) 
      contrast(${this.imageFilters.contrast}%) 
      saturation(${this.imageFilters.saturation}%)
    `.trim();
    const cropperImage = document.querySelector('.cropper-container .cropper-canvas');
    const cropperView = document.querySelector('.cropper-container .cropper-view-box');
    const cropperDragBox = document.querySelector('.cropper-container .cropper-face');
    imageEl.style.setProperty('filter', filterStyle, 'important');
    if (cropperImage) {
      ((cropperImage as HTMLElement).style as CSSStyleDeclaration).setProperty('filter', filterStyle, 'important');
    }
    if (cropperView) {
      ((cropperView as HTMLElement).style as CSSStyleDeclaration).setProperty('filter', filterStyle, 'important');
    }
    if (cropperDragBox) {
      ((cropperDragBox as HTMLElement).style as CSSStyleDeclaration).setProperty('filter', filterStyle, 'important');
    }
  }

  resetImageFilters() {
    this.imageFilters = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      straighten: 0,
    };
    const sliderIds = ['brightness', 'contrast', 'saturation'];
    sliderIds.forEach(id => {
      const slider = this.elements[`${id}Slider`];
      const valueDisplay = this.elements[`${id}Value`];
      if (slider) {
        slider.value = id === 'saturation' ? 100 : 100;
      }
      if (valueDisplay) {
        const inputField = valueDisplay.querySelector('input');
        if (inputField) {
          inputField.value = id === 'saturation' ? 100 : 100;
        } else {
          valueDisplay.textContent = id === 'saturation' ? '100%' : '100%';
        }
      }
    });
    if (this.elements.straightenSlider) {
      this.elements.straightenSlider.value = 0;
      const straightenValueDisplay = this.elements.straightenValue;
      if (straightenValueDisplay) {
        const inputField = straightenValueDisplay.querySelector('input');
        if (inputField) {
          inputField.value = 0;
        } else {
          straightenValueDisplay.textContent = '0°';
        }
      }
    }
    if (this.elements.imageToCrop) {
      this.applyImageFilters();
    }
    if (this.cropper) {
      this.cropper.rotateTo(0);
    }
  }

  handleImage(event : Event, type : 'pfp' | 'banner') {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (this.elements.imageToCrop) {
        this.elements.imageToCrop.src = (e.target as FileReader).result as string;
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
    this.elements.imageToCrop.style.filter = ''; 
    this.resetImageFilters(); 
    if (this.elements.brightnessSlider) this.elements.brightnessSlider.step = "1";
    if (this.elements.contrastSlider) this.elements.contrastSlider.step = "1";
    if (this.elements.saturationSlider) this.elements.saturationSlider.step = "1";
    if (this.elements.straightenSlider) this.elements.straightenSlider.step = "0.5";
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
          if (this.cropper.zoomTo) {
            this.cropper.zoomTo(0);
          }
          ['brightness', 'contrast', 'saturation'].forEach(filter => {
            this.updateImageFilter(filter as keyof ProfileSlider['imageFilters']);
          });
          this.updateStraighten();
          this.applyImageFilters();
        }
      } as any);
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
      this.elements.imageToCrop.style.filter = '';
    }
  }

  crop() {
    if (!this.cropper) return;
    try {
        const croppedCanvas = this.cropper.getCroppedCanvas({
            maxWidth: this.cropType === 'pfp' ? 500 : 1920,
            maxHeight: this.cropType === 'pfp' ? 500 : 1080,
            fillColor: '#fff'
        });
        let finalCanvas = croppedCanvas;
        const filtersApplied = (
            this.imageFilters.brightness !== 100 ||
            this.imageFilters.contrast !== 100 ||
            this.imageFilters.saturation !== 100
        );
        if (filtersApplied) {
            const ctx = finalCanvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const data = imageData.data;
            const b = this.imageFilters.brightness / 100;
            const contrastFactor = this.imageFilters.contrast / 100;
            const s = this.imageFilters.saturation / 100;
            for (let i = 0; i < data.length; i += 4) {
                let r_orig = data[i];
                let g_orig = data[i + 1];
                let b_orig = data[i + 2];
                let r_bright = r_orig * b;
                let g_bright = g_orig * b;
                let b_bright = b_orig * b;
                let r_contrast = (r_bright - 128) * contrastFactor + 128;
                let g_contrast = (g_bright - 128) * contrastFactor + 128;
                let b_contrast = (b_bright - 128) * contrastFactor + 128;
                const luma = 0.299 * r_contrast + 0.587 * g_contrast + 0.114 * b_contrast;
                let r_final = luma * (1 - s) + r_contrast * s;
                let g_final = luma * (1 - s) + g_contrast * s;
                let b_final = luma * (1 - s) + b_contrast * s;
                data[i] = Math.max(0, Math.min(255, r_final));
                data[i + 1] = Math.max(0, Math.min(255, g_final));
                data[i + 2] = Math.max(0, Math.min(255, b_final));
            }
            ctx.putImageData(imageData, 0, 0);
        }
        const croppedImageUrl = finalCanvas.toDataURL('image/jpeg', 0.9);
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
      if ((err as any).name === 'AbortError') return;
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
    this.elements.steps.forEach((stepEl: HTMLElement, index : number) => {
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
      (formGroup as HTMLElement).style.animation = 'none';
      setTimeout(() => {
        (formGroup as HTMLElement).style.animation = 'slideInUp 0.6s ease-out both';
      }, 50);
    }
    setTimeout(() => {
      if (this.currentStep === 1) this.elements.displayName?.focus();
      else if (this.currentStep === 2) this.elements.bio?.focus();
    }, 300);
  }

  async completeProfile(options = {}) {
    const skipImages = !!(options as any).skipImages;

    if (!this.isValid[1]) {
      this.showSkipButton(false);
      return;
    }

    const payload: {
      displayName: string;
      bio: string;
      profilePicture?: string;
      bannerImage?: string;
    } = {
      displayName: this.elements.displayName?.value?.trim() ?? '',
      bio: this.elements.bio?.value?.trim() ?? '',
    };

    const pfpImg = this.elements.profilePicPreview?.querySelector('img')?.src;
    if (pfpImg && !skipImages) payload.profilePicture = pfpImg;

    const bannerStyle = this.elements.bannerPreview?.style?.backgroundImage || '';
    const bannerImage = bannerStyle ? bannerStyle.slice(4, -1).replace(/"/g, "") : '';
    if (bannerImage && !skipImages) payload.bannerImage = bannerImage;

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

    try {
      const response = await fetch("http://localhost:5000/api/createProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('Profile created successfully:', result);
      
      if (this.elements.completeBtn) {
        this.elements.completeBtn.disabled = false;
        this.elements.completeBtn.innerHTML = 'Complete Profile';
      }
      if (this.elements.skipBtn) {
        this.elements.skipBtn.disabled = false;
        this.elements.skipBtn.innerHTML = 'Skip';
      }

      alert(`Profile created successfully!`);
    } catch (error) {
      console.error('Error creating profile:', error);
      if (this.elements.completeBtn) {
        this.elements.completeBtn.disabled = false;
        this.elements.completeBtn.innerHTML = 'Complete Profile';
      }
      if (this.elements.skipBtn) {
        this.elements.skipBtn.disabled = false;
        this.elements.skipBtn.innerHTML = 'Skip';
      }
      alert(`Error creating profile: ${(error as Error).message}`);
    }
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

  showSkipButton(show: boolean) {
    if (!this.elements.skipBtn) return;
    const currentStepData = this.stepData[this.currentStep];
    const isMandatory = currentStepData?.mandatory ?? false;
    if (isMandatory) {
      this.elements.skipBtn.classList.add('hidden');
      return;
    }
    if (show) {
      this.elements.skipBtn.classList.remove('hidden');
    } else {
      this.elements.skipBtn.classList.add('hidden');
    }
  }
}

async function checkNameAvailability(name: string, options = {}) {
  const controller = new AbortController();
  const userSignal = (options as any).signal;
  let timeoutId: NodeJS.Timeout | number | null = null;

  // If user provided a signal, abort if either times out or user aborts
  function onAbort() {
    controller.abort();
  }
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', onAbort);
  }

  try {
    timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch("http://localhost:5000/api/checkUsername", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
      signal: controller.signal
    });
    const result = await response.json();
    return [
      !!result.available,
      result.message || (result.available ? 'The Username is Available' : result.message),
      result.suggestion || ""
    ];
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('Name check aborted');
      throw error;
    }
    console.error("Error checking name availability:", error);
    return [false, "Server error. Try again later.", ""];
  } finally {
    if (timeoutId) clearTimeout(timeoutId as NodeJS.Timeout);
    if (userSignal) userSignal.removeEventListener('abort', onAbort);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ProfileSlider();
});
