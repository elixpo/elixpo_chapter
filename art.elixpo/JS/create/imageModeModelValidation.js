document.querySelectorAll(".modelsTiles").forEach(tile => {
    tile.addEventListener("click", () => {
        if (isImageMode) {
            const model = tile.getAttribute("data-model");
            if (model === "flux" || model === "turbo") {
                notify("✨ This model doesn't support image-to-image edits. Please select another model to continue your creative journey! ✨");
            }
        }
    });
});