document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const profileImage = document.getElementById('profileImage');
    const hideProfileCheckbox = document.getElementById('hide-profile');
    const defaultAvatar = '../IMAGES/Account/default-avatar.png';

    // Load saved image from localStorage if it exists
    const savedImage = localStorage.getItem('profileImage');
    if (savedImage) {
        profileImage.src = savedImage;
    }

    hideProfileCheckbox.addEventListener('change', function (e) {
        if (this.checked) {
            profileImage.src = defaultAvatar;
            localStorage.removeItem('profileImage');
        } else {
            // If unchecked, try to restore from localStorage
            const restoredImage = localStorage.getItem('profileImage');
            if (restoredImage) {
                profileImage.src = restoredImage;
            }
        }
    });

    imageUpload.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                profileImage.src = event.target.result;
                // Save to localStorage
                localStorage.setItem('profileImage', event.target.result);
                // Uncheck the 'hide' box, since user is uploading a new image
                hideProfileCheckbox.checked = false;
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle notification actions
    document.querySelectorAll('.mark-read').forEach(button => {
        button.addEventListener('click', function () {
            this.closest('.notification-item').classList.remove('unread');
        });
    });

    document.querySelectorAll('.delete-notification').forEach(button => {
        button.addEventListener('click', function () {
            this.closest('.notification-item').remove();
        });
    });

    // Section switching functionality
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = {
        'Account': [
            document.querySelector('.profile-card'),
            document.querySelector('.linked-accounts-card')
        ],
        'Notifications': [document.querySelector('.notification-section')],
        'Wallets': [document.querySelector('.wallet-section')],
        'Beta': [document.querySelector('.beta-section')],
        'Security': [document.querySelector('.security-section')],
        'Log out': [document.querySelector('.logout-section')]
    };

    // Hide all sections except Account sections by default
    document.querySelectorAll('.card').forEach(card => {
        if (!card.classList.contains('profile-card') && !card.classList.contains('linked-accounts-card')) {
            card.style.display = 'none';
        }
    });

    menuItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();

            // Get section name from menu item text
            const sectionName = this.textContent.trim();

            // Hide all sections first
            document.querySelectorAll('.card').forEach(card => {
                if(card) card.style.display = 'none';
            });

            // Show relevant sections
            if (sections[sectionName]) {
                sections[sectionName].forEach(section => {
                    if (section) section.style.display = 'block';
                });
            }

            // Update active menu item
            menuItems.forEach(item => item.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Show Account section by default
    sections['Account'].forEach(section => {
        if (section) section.style.display = 'block';
    });
    
    // Set 'Account' as the active menu item on load
    // Assuming 'Account' is the first menu item
    if (menuItems.length > 0) {
        menuItems[0].classList.add('active');
    }

    // Add delete account confirmation
    document.getElementById('deleteAccountBtn').addEventListener('click', function () {
        if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            // Add your delete account logic here
            alert('Account deleted successfully');
        }
    });
});
