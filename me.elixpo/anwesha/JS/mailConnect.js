document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector('form');
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        showToast("Comeon! Talk to Ayush, he's the one to connect you :)");
});

});