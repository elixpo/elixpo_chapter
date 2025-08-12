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
            };
            reader.readAsDataURL(file);
        }
    });

    // Notification Section Handling
    document.querySelector('.menu-item:nth-child(2)').addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('.card').forEach(card => card.style.display = 'none');
        document.querySelector('.notification-section').style.display = 'block';

        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        this.classList.add('active');
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
                card.style.display = 'none';
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

    // Add delete account confirmation
    document.getElementById('deleteAccountBtn').addEventListener('click', function () {
        if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            // Add your delete account logic here
            alert('Account deleted successfully');
        }
    });
});
