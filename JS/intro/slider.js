class ProfileSlider {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 3;
    this.isValid = { 1: false, 2: true, 3: true }; // Step 2 and 3 are optional
    
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
      skipPhotoBtn: document.getElementById('skipPhotoBtn'),
      profilePicture: document.getElementById('profilePicture'),
      profilePicPreview: document.getElementById('profilePicPreview')
    };
    
    this.stepData = {
      1: {
        title: "What's your name?",
        description: "This will be your display name on LixBlogs"
      },
      2: {
        title: "Tell us about yourself",
        description: "Write a short bio to help others know you better (optional)"
      },
      3: {
        title: "Add a profile picture",
        description: "Upload a photo or skip this step for now"
      }
    };
    
    this.init();
  }
  
  init() {
    this.bindEvents();
    this.updateUI();
  }
  
  bindEvents() {
    // Next button
    this.elements.nextBtn.addEventListener('click', () => this.nextStep());
    
    // Back button
    this.elements.backBtn.addEventListener('click', () => this.prevStep());
    
    // Skip photo button
    this.elements.skipPhotoBtn.addEventListener('click', () => this.completeProfile());
    
    // Display name validation
    this.elements.displayName.addEventListener('input', () => this.validateDisplayName());
    
    // Bio character count
    this.elements.bio.addEventListener('input', () => this.updateBioCount());
    
    // Profile picture upload
    this.elements.profilePicture.addEventListener('change', (e) => this.handleProfilePicture(e));
    
    // Form submission
    document.getElementById('profileForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.completeProfile();
    });
    
    // Keyboard navigation
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
      nameStatus.innerHTML = '<ion-icon name="checkmark-circle-outline" class="text-green-500"></ion-icon><span class="text-green-500">Looks good!</span>';
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
    // Update progress bar
    const progress = (this.currentStep / this.totalSteps) * 100;
    this.elements.progressBar.style.width = `${progress}%`;
    
    // Update step indicators
    this.elements.indicators.forEach((indicator, index) => {
      const stepNum = index + 1;
      indicator.classList.remove('active', 'completed');
      
      if (stepNum < this.currentStep) {
        indicator.classList.add('completed');
      } else if (stepNum === this.currentStep) {
        indicator.classList.add('active');
      }
    });
    
    // Update title and description
    const stepInfo = this.stepData[this.currentStep];
    this.elements.stepTitle.textContent = stepInfo.title;
    this.elements.stepDescription.textContent = stepInfo.description;
    
    // Update step content visibility
    this.elements.steps.forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active', 'prev');
      
      if (stepNum === this.currentStep) {
        step.classList.add('active');
      } else if (stepNum < this.currentStep) {
        step.classList.add('prev');
      }
    });
    
    this.updateButtons();
  }
  
  updateButtons() {
    // Back button
    if (this.currentStep === 1) {
      this.elements.backBtn.classList.add('hidden');
    } else {
      this.elements.backBtn.classList.remove('hidden');
    }
    
    // Next/Complete buttons
    if (this.currentStep === this.totalSteps) {
      this.elements.nextBtn.classList.add('hidden');
      this.elements.completeBtn.classList.remove('hidden');
    } else {
      this.elements.nextBtn.classList.remove('hidden');
      this.elements.completeBtn.classList.add('hidden');
      
      // Enable/disable next button based on validation
      this.elements.nextBtn.disabled = !this.isValid[this.currentStep];
    }
  }
  
  animateStep() {
    // Add entrance animation to current step
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
    
    // Focus on relevant input
    setTimeout(() => {
      if (this.currentStep === 1) {
        this.elements.displayName.focus();
      } else if (this.currentStep === 2) {
        this.elements.bio.focus();
      }
    }, 400);
  }
  
  completeProfile() {
    // Collect form data
    const formData = new FormData();
    formData.append('displayName', this.elements.displayName.value.trim());
    formData.append('bio', this.elements.bio.value.trim());
    
    if (this.elements.profilePicture.files[0]) {
      formData.append('profilePicture', this.elements.profilePicture.files[0]);
    }
    
    // Show loading state
    this.elements.completeBtn.disabled = true;
    this.elements.completeBtn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Creating Profile...</span>
    `;
    
    // Simulate API call
    setTimeout(() => {
      console.log('Profile completed:', Object.fromEntries(formData));
      // Handle successful completion here
      // Redirect to dashboard or show success message
    }, 2000);
  }
}

// Initialize the slider when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ProfileSlider();
});