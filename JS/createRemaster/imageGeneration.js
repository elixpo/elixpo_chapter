if(generationNumber == 1)
{
    document.querySelector(".tile1").classList.remove("hidden");
    document.querySelector(".tile2").classList.add("hidden");
    document.querySelector(".tile3").classList.add("hidden");
    document.querySelector(".tile4").classList.add("hidden");

    document.querySelector(".tile1").style.cssText = `
         grid-column: span 6 / span 6;
        grid-row: span 5 / span 5;
    `

    document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
        grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 8px;
    `
}

else if(generationNumber == 2)
{
     
    document.querySelector(".tile1").classList.remove("hidden");
    document.querySelector(".tile2").classList.remove("hidden");
    document.querySelector(".tile3").classList.add("hidden");
    document.querySelector(".tile4").classList.add("hidden");

    document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
        grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 8px;
    `

    document.querySelector(".tile1").style.cssText = `
        grid-column: span 3 / span 3;
    grid-row: span 5 / span 5;
    `
    document.querySelector(".tile2").style.cssText = `
        grid-column: span 3 / span 3;
    grid-row: span 5 / span 5;
    grid-column-start: 4;   
    `
}

else if(generationNumber == 3)
{

    document.querySelector(".tile1").classList.remove("hidden");
    document.querySelector(".tile2").classList.remove("hidden");
    document.querySelector(".tile3").classList.remove("hidden");
    document.querySelector(".tile4").classList.add("hidden");

    document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
        grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 8px;
    `

    document.querySelector(".tile1").style.cssText = `
        grid-column: span 2 / span 2;
    grid-row: span 5 / span 5;
    `
    document.querySelector(".tile2").style.cssText = `
       grid-column: span 2 / span 2;
    grid-row: span 5 / span 5;
    grid-column-start: 3;
    `
    document.querySelector(".tile3").style.cssText = `
        grid-column: span 2 / span 2;
    grid-row: span 5 / span 5;
    grid-column-start: 5;
    `
}

else if(generationNumber == 4)
{
    document.querySelector(".tile1").classList.remove("hidden");
    document.querySelector(".tile2").classList.remove("hidden");
    document.querySelector(".tile3").classList.remove("hidden");
    document.querySelector(".tile4").classList.remove("hidden");

    document.querySelector("#imageGenerator  > .imageTiles").style.cssText = `
        grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 8px;
    `


    document.querySelector(".tile1").style.cssText = `
       grid-column: span 2 / span 2;
    grid-row: span 3 / span 3;
    `
    document.querySelector(".tile2").style.cssText = `
        grid-column: span 2 / span 2;
    grid-row: span 3 / span 3;
    grid-column-start: 3;
    grid-row-start: 2;
    `
    document.querySelector(".tile3").style.cssText = `
        grid-column: span 2 / span 2;
    grid-row: span 3 / span 3;
    grid-column-start: 5;
    grid-row-start: 2;
    `
    document.querySelector(".tile4").style.cssText = `
        grid-column: span 2 / span 2;
    grid-row: span 3 / span 3;
    grid-column-start: 7;
    grid-row-start: 3;
    `
}