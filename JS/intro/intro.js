class ProfileSlider {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 3;
    this.isValid = { 1: false, 2: true, 3: true }; 
    this.cropper = null;
    this.cropType = null;

    this.elements = {
      steps: document.querySelectorAll('.step-content'),
      indicators: document.querySelectorAll('.step'),
      progressBar: document.getElementById('progressBar'),
      stepTitle: document.getElementById('stepTitle'),
      stepDescription: document.getElementById('stepDescription'),
      nextBtn: document.getElementById('nextBtn'),
      backBtn: document.getElementById('backBtn'),
      completeBtn: document.getElementById('completeBtn'),
      displayName: document.getElementById('displayName'),
      bio: document.getElementById('bio'),
      bioCharCount: document.getElementById('bioCharCount'),
      profilePicture: document.getElementById('profilePicture'),
      profilePicPreview: document.getElementById('profilePicPreview'),
      bannerImage: document.getElementById('bannerImage'),
      bannerPreview: document.getElementById('bannerPreview'),
      cropperModal: document.getElementById('cropperModal'),
      imageToCrop: document.getElementById('imageToCrop'),
      cancelCrop: document.getElementById('cancelCrop'),
      cropImage: document.getElementById('cropImage')
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
        description: "Upload a photo or skip this step for now",
        step: 3
      }
    };

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    this.elements.nextBtn.addEventListener('click', () => this.nextStep());
    this.elements.backBtn.addEventListener('click', () => this.prevStep());

    this.elements.displayName.addEventListener('input', () => {
      this.isValid[1] = false;
      this.updateButtons();
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        console.log('Validating display name...');
        this.validateDisplayName();
      }, 1000);
    });

    this.elements.bio.addEventListener('input', () => this.updateBioCount());
    this.elements.profilePicture.addEventListener('change', (e) => this.handleImage(e, 'pfp'));
    this.elements.bannerImage.addEventListener('change', (e) => this.handleImage(e, 'banner'));
    this.elements.cancelCrop.addEventListener('click', () => this.closeCropper());
    this.elements.cropImage.addEventListener('click', () => this.crop());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (this.currentStep < this.totalSteps && this.isValid[this.currentStep]) {
          this.nextStep();
        } else if (this.currentStep === this.totalSteps) {
          this.completeProfile();
        }
      }
    });
  }

  handleImage(event, type) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.elements.imageToCrop.src = e.target.result;
        this.cropType = type;
        this.openCropper();
      };
      reader.readAsDataURL(file);
    }
  }

  openCropper() {
    this.elements.cropperModal.classList.remove('hidden');
    let aspectRatio = this.cropType === 'pfp' ? 1 : 16 / 9;

    this.cropper = new Cropper(this.elements.imageToCrop, {
      aspectRatio,
      viewMode: 1,
      maxCropBoxWidth: this.cropType === 'pfp' ? 500 : 1920,
      maxCropBoxHeight: this.cropType === 'pfp' ? 500 : 1080,
    });
  }

  closeCropper() {
    this.elements.cropperModal.classList.add('hidden');
    if (this.cropper && typeof this.cropper.destroy === 'function') {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  crop() {
    if (this.cropper) {
      const canvas = this.cropper.getCroppedCanvas({
        maxWidth: this.cropType === 'pfp' ? 500 : 1920,
        maxHeight: this.cropType === 'pfp' ? 500 : 1080,
      });
      const croppedImageUrl = canvas.toDataURL('image/jpeg');

      if (this.cropType === 'pfp') {
        this.elements.profilePicPreview.innerHTML = `
          <img src="${croppedImageUrl}" alt="Profile Picture" class="w-full h-full object-cover rounded-full">
        `;
      } else if (this.cropType === 'banner') {
        this.elements.bannerPreview.style.backgroundImage = `url(${croppedImageUrl})`;
        this.elements.bannerPreview.innerHTML = '';
      }
      this.closeCropper();
    }
  }

  async validateDisplayName() {
    const name = this.elements.displayName.value.trim();
    const nameStatus = document.getElementById('nameStatus');

    if (name.length === 0) {
      this.isValid[1] = false;
      nameStatus.innerHTML = '';
    } else if (name.length < 6) {
      this.isValid[1] = false;
      nameStatus.innerHTML = `
        <ion-icon name="warning-outline" class="text-yellow-500 mt-[10px] mr-[5px]"></ion-icon>
        <span class="text-yellow-500 mt-[10px] mr-[5px]">Name must be at least 6 characters</span>`;
    } else if (name.length > 20) {
      this.isValid[1] = false;
      nameStatus.innerHTML = `
        <ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon>
        <span class="text-red-500 mt-[10px] mr-[5px]">Name must be less than 20 characters</span>`;
    } else {
      const [available, message, suggestion] = await checkNameAvailability(name);
      if (!available) {
        this.isValid[1] = false;
        nameStatus.innerHTML = suggestion && suggestion.length > 0 && suggestion !== name
          ? `<ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon>
             <span class="text-red-500 mt-[10px] mr-[5px]">${message}... How about ${suggestion}?</span>`
          : `<ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon>
             <span class="text-red-500 mt-[10px] mr-[5px]">${message}</span>`;
      } else {
        this.isValid[1] = true;
        nameStatus.innerHTML = `
          <ion-icon name="checkmark-circle-outline" class="text-green-500 mt-[10px] mr-[5px]"></ion-icon>
          <span class="text-green-500 mt-[10px] mr-[5px]">${message}</span>`;
      }
    }

    this.updateButtons();
  }

  updateBioCount() {
    const bio = this.elements.bio.value;
    this.elements.bioCharCount.textContent = bio.length;

    if (bio.length !== 0 && bio.length < 10) {
      this.isValid[2] = false;
      this.elements.bioCharCount.parentElement.classList.add('text-red-500');
      this.elements.bioCharCount.parentElement.classList.remove('text-slate-500');
    } else if (bio.length > 150) {
      this.elements.bioCharCount.parentElement.classList.add('text-red-500');
      this.elements.bioCharCount.parentElement.classList.remove('text-slate-500');
    } else {
      this.isValid[2] = true;
      this.elements.bioCharCount.parentElement.classList.remove('text-red-500');
      this.elements.bioCharCount.parentElement.classList.add('text-slate-500');
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
    const progress = (this.currentStep / this.totalSteps) * 100;
    this.elements.progressBar.style.width = `${progress}%`;

    const stepInfo = this.stepData[this.currentStep];
    this.elements.stepTitle.textContent = stepInfo.title;
    this.elements.stepDescription.textContent = stepInfo.description;

    document.querySelectorAll(".step-content").forEach((step, index) => {
      step.classList.toggle('hidden', index + 1 !== this.currentStep);
    });

    this.updateButtons();
  }

  updateButtons() {
    if (this.currentStep === 1) {
      this.elements.backBtn.classList.add('hidden');
    } else {
      this.elements.backBtn.classList.remove('hidden');
    }

    if (this.currentStep === this.totalSteps) {
      this.elements.nextBtn.classList.add('hidden');
      this.elements.completeBtn.classList.remove('hidden');
    } else {
      this.elements.nextBtn.classList.remove('hidden');
      this.elements.completeBtn.classList.add('hidden');
      this.elements.nextBtn.disabled = !this.isValid[this.currentStep];
    }
  }

  animateStep() {
    const currentStepElement = document.querySelector(`[data-step="${this.currentStep}"]`);
    if (currentStepElement) {
      const formGroup = currentStepElement.querySelector('.form-group');
      if (formGroup) {
        formGroup.style.animation = 'none';
        setTimeout(() => {
          formGroup.style.animation = 'slideInUp 0.6s ease-out both';
        }, 100);
      }
    }

    setTimeout(() => {
      if (this.currentStep === 1) this.elements.displayName.focus();
      else if (this.currentStep === 2) this.elements.bio.focus();
    }, 400);
  }

  completeProfile() {
    const formData = new FormData();
    formData.append('displayName', this.elements.displayName.value.trim());
    formData.append('bio', this.elements.bio.value.trim());

    const pfpImage = this.elements.profilePicPreview.querySelector('img');
    if (pfpImage) formData.append('profilePicture', pfpImage.src);

    const bannerImage = this.elements.bannerPreview.style.backgroundImage.slice(4, -1).replace(/"/g, "");
    if (bannerImage) formData.append('bannerImage', bannerImage);

    this.elements.completeBtn.disabled = true;
    this.elements.completeBtn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Creating Profile...</span>
    `;

    setTimeout(() => {
      const entries = {};
      formData.forEach((value, key) => { entries[key] = value; });
      console.log('Profile completed:', entries);
    }, 2000);
  }
}

// ✅ Simplified and fixed name availability check
async function checkNameAvailability(name) {
  try {
    const response = await fetch("http://localhost:5000/api/checkUsername", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
    });

    const result = await response.json();
    console.log("Name availability result:", result);
    return [result.available, result.message, result.suggestion || ""];
  } catch (error) {
    console.error("Error checking name availability:", error);
    return [false, "Server error. Try again later.", ""];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ProfileSlider();
});
