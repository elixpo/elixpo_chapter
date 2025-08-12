// Tabs functionality for Chat/Composer area
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active state from all tabs and hide all contents
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.style.display = 'none');

    // Activate the clicked tab and show corresponding content
    tab.classList.add('active');
    const target = tab.getAttribute('data-tab');
    document.getElementById(target).style.display = 'block';
  });
});


// document.getElementById("container").addEventListener("scroll", () => {
//   console.log(document.getElementById("container").scrollTop);
// })

document.getElementById("container").scroll(0, 1318);