function showToast(message, duration = 3000) {
    const toast = document.getElementById('toastNotification');
    toast.querySelector('span').textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, duration);
}