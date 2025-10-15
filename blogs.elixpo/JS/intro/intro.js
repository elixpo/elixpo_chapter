class ProfileSlider {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 5;
    this.isValid = { 1: false, 2: true, 3: true, 4: true, 5: true };

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
      cropModal: document.getElementById('cropModal'),
      imageToCrop: document.getElementById('imageToCrop'),
      cropButton: document.getElementById('cropButton'),
    };

    this.stepData = {
      1: { title: "What's your name?", description: "This will be your display name on LixBlogs" },
      2: { title: "Tell us about yourself", description: "Write a short bio to help others know you better (optional)" },
      3: { title: "Add a profile picture", description: "Upload a photo or skip this step for now" },
      4: { title: "Add a banner", description: "Upload a banner for your profile" },
      5: { title: "You're all set!", description: "Review your information and complete your profile" }
    };

    this.cropper = null;
    this.currentCropType = null;

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
        this.validateDisplayName();
      }, 1000);
    });
    this.elements.bio.addEventListener('input', () => this.updateBioCount());
    this.elements.profilePicture.addEventListener('change', (e) => this.handleImage(e, 'pfp'));
    this.elements.bannerImage.addEventListener('change', (e) => this.handleImage(e, 'banner'));
    this.elements.cropButton.addEventListener('click', () => this.cropImage());


    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.currentStep < this.totalSteps && this.isValid[this.currentStep]) {
          this.nextStep();
        } else if (this.currentStep === this.totalSteps) {
          this.completeProfile();
        }
      }
    });
  }

  async validateDisplayName() {
    const name = this.elements.displayName.value.trim();
    const nameStatus = document.getElementById('nameStatus');

    if (name.length === 0) {
      this.isValid[1] = false;
      nameStatus.innerHTML = '';
    } else if (name.length < 2) {
      this.isValid[1] = false;
      nameStatus.innerHTML = '<ion-icon name="warning-outline" class="text-yellow-500 mt-[10px] mr-[5px]"></ion-icon><span class="text-yellow-500 mt-[10px] mr-[5px]">Name must be at least 2 characters</span>';
    } else if (name.length > 20) {

      this.isValid[1] = false;
      nameStatus.innerHTML = '<ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon><span class="text-red-500 mt-[10px] mr-[5px]">Name must be less than 20 characters</span>';
    } else {
      this.isValid[1] = true;

      const [available, message, suggestion] = await checkNameAvailability(name);
      if (!available) {
        this.isValid[1] = false;
        if (suggestion && suggestion.length > 0 && suggestion !== name) {
          nameStatus.innerHTML = `<ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon><span class="text-red-500 mt-[10px] mr-[5px]">${message}... How about ${suggestion} ?</span>`;
        }
        else {
          nameStatus.innerHTML = `<ion-icon name="close-circle-outline" class="text-red-500 mt-[10px] mr-[5px]"></ion-icon><span class="text-red-500 mt-[10px] mr-[5px]">${message}</span>`;
        }
        this.updateButtons();
        return;
      }
      else if (available) {
        nameStatus.innerHTML = `<ion-icon name="checkmark-circle-outline" class="text-green-500 mt-[10px] mr-[5px]"></ion-icon><span class="text-green-500 mt-[10px] mr-[5px]">${message}</span>`;
      }
    }

    this.updateButtons();
  }

  updateBioCount() {
    const bio = this.elements.bio.value;
    this.elements.bioCharCount.textContent = bio.length;

    if (bio.length > 150) {
      this.elements.bioCharCount.parentElement.classList.add('text-red-500');
      this.elements.bioCharCount.parentElement.classList.remove('text-slate-500');
    } else {
      this.elements.bioCharCount.parentElement.classList.remove('text-red-500');
      this.elements.bioCharCount.parentElement.classList.add('text-slate-500');
    }
  }

  handleImage(event, type) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) { // 1MB size limit
        alert("File is too large. Please select a file smaller than 1MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.elements.imageToCrop.src = e.target.result;
        this.elements.cropModal.style.display = 'flex';
        this.currentCropType = type;
        let aspectRatio = 1;
        if (type === 'banner') {
          aspectRatio = 16 / 9;
        }
        this.cropper = new Cropper(this.elements.imageToCrop, {
          aspectRatio: aspectRatio,
          viewMode: 1,
        });
      };
      reader.readAsDataURL(file);
    }
  }

  cropImage() {
    const canvas = this.cropper.getCroppedCanvas({
      width: this.currentCropType === 'pfp' ? 500 : 1920,
      height: this.currentCropType === 'pfp' ? 500 : 1080,
    });
    const previewElement = this.currentCropType === 'pfp' ? this.elements.profilePicPreview : this.elements.bannerPreview
    previewElement.innerHTML = `<img src="${canvas.toDataURL()}" alt="${this.currentCropType} Preview" class="w-full h-full object-cover ${this.currentCropType === 'pfp' ? 'rounded-full' : ''}">`;
    this.elements.cropModal.style.display = 'none';
    this.cropper.destroy();
  }


  nextStep() {
    if (this.currentStep < this.totalSteps && this.isValid[this.currentStep]) {
      this.currentStep++;
      this.updateUI();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.updateUI();
    }
  }

  updateUI() {
    const progress = (this.currentStep / this.totalSteps) * 100;
    this.elements.progressBar.style.width = `${progress}%`;

    this.elements.steps.forEach((step, index) => {
      step.classList.toggle('hidden', index + 1 !== this.currentStep);
    });

    const currentStepData = this.stepData[this.currentStep];
    this.elements.stepTitle.textContent = currentStepData.title;
    this.elements.stepDescription.textContent = currentStepData.description;

    this.updateButtons();
  }

  updateButtons() {
    this.elements.backBtn.classList.toggle('hidden', this.currentStep === 1);
    this.elements.nextBtn.classList.toggle('hidden', this.currentStep === this.totalSteps);
    this.elements.completeBtn.classList.toggle('hidden', this.currentStep !== this.totalSteps);
    this.elements.nextBtn.disabled = !this.isValid[this.currentStep];
  }

  completeProfile() {
    const formData = new FormData();
    formData.append('displayName', this.elements.displayName.value.trim());
    formData.append('bio', this.elements.bio.value.trim());

    if (this.elements.profilePicture.files[0]) {
      const croppedPFP = this.elements.profilePicPreview.querySelector('img').src;
      fetch(croppedPFP)
        .then(res => res.blob())
        .then(blob => {
          formData.append('profilePicture', blob, 'profile.png');
        })
    }
    if (this.elements.bannerImage.files[0]) {
      const croppedBanner = this.elements.bannerPreview.querySelector('img').src;
      fetch(croppedBanner)
        .then(res => res.blob())
        .then(blob => {
          formData.append('banner', blob, 'banner.png');
        })
    }


    this.elements.completeBtn.disabled = true;
    this.elements.completeBtn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Creating Profile...</span>
    `;

    setTimeout(() => {
      console.log('Profile completed:', Object.fromEntries(formData));
    }, 2000);
  }
}


async function checkNameAvailability(name) {
  try {
    const response = await fetch("http://localhost:5000/api/checkUsername", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: name }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return [errorData.available, errorData.message, errorData.suggestion];
    }
    else {
      const result = await response.json();
      return [result.available, result.message, result.suggestion];
    }


  }
  catch (error) {
    console.error("Error checking name availability:", error);
    return [false, "An error occurred", ""];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ProfileSlider();
});