class ProfileSlider {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 3;
    this.isValid = { 1: false, 2: true, 3: true }; 
    
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
      profilePicPreview: document.getElementById('profilePicPreview')
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
    this.elements.displayName.addEventListener('input', () => this.validateDisplayName());
    this.elements.bio.addEventListener('input', () => this.updateBioCount());
    this.elements.profilePicture.addEventListener('change', (e) => this.handleProfilePicture(e));
    
    
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
  
  validateDisplayName() {
    const name = this.elements.displayName.value.trim();
    const nameStatus = document.getElementById('nameStatus');
    
    if (name.length === 0) {
      this.isValid[1] = false;
      nameStatus.innerHTML = '';
    } else if (name.length < 2) {
      this.isValid[1] = false;
      nameStatus.innerHTML = '<ion-icon name="warning-outline" class="text-yellow-500"></ion-icon><span class="text-yellow-500">Name must be at least 2 characters</span>';
    } else if (name.length > 20) {
      this.isValid[1] = false;
      nameStatus.innerHTML = '<ion-icon name="close-circle-outline" class="text-red-500"></ion-icon><span class="text-red-500">Name must be less than 20 characters</span>';
    } else {
      this.isValid[1] = true;
      nameStatus.innerHTML = '<ion-icon name="checkmark-circle-outline" class="text-green-500 mt-[10px] mr-[5px]"></ion-icon><span class="text-green-500 mt-[10px] mr-[5px]">Looks good!</span>';
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
  
  handleProfilePicture(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.elements.profilePicPreview.innerHTML = `
          <img src="${e.target.result}" alt="Profile Picture" class="w-full h-full object-cover rounded-full">
        `;
      };
      reader.readAsDataURL(file);
    }
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
      if (this.currentStep === 1) {
        this.elements.displayName.focus();
      } else if (this.currentStep === 2) {
        this.elements.bio.focus();
      }
    }, 400);
  }
  
  completeProfile() {
    const formData = new FormData();
    formData.append('displayName', this.elements.displayName.value.trim());
    formData.append('bio', this.elements.bio.value.trim());
    
    if (this.elements.profilePicture.files[0]) {
      formData.append('profilePicture', this.elements.profilePicture.files[0]);
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


document.addEventListener('DOMContentLoaded', () => {
  new ProfileSlider();
});