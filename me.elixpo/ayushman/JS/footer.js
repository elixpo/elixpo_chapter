if(document.querySelector(".contactMe"))
{
    document.querySelector(".contactMe").addEventListener("click", function() {
        redirectTo("connect");
    });
}

const socials = [
    {
        selector: '.footerContent .socialIcon[name="logo-github"], .footerContent .socialIcon:nth-child(1)',
        url: "https://github.com/Circuit-Overtime"
    },
    {
        selector: '.footerContent .socialIcon[name="logo-linkedin"], .footerContent .socialIcon:nth-child(3)',
        url: "https://linkedin.com/in/elixpo"
    },
    {
        selector: '.footerContent .socialIcon[name="logo-instagram"], .footerContent .socialIcon:nth-child(5)',
        url: "https://instagram.com/elixpo_"
    },
    {
        selector: '.footerContent .socialIcon[name="logo-youtube"], .footerContent .socialIcon:nth-child(7)',
        url: "https://youtube.com/@elixpo"
    }
];

document.querySelectorAll('.footerContent .socialIcon').forEach((icon, idx) => {
    icon.addEventListener('click', () => {
        if (socials[idx]) window.open(socials[idx].url, '_blank');
    });
});