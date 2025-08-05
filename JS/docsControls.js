document.getElementById("typography").addEventListener("click", function() {
    document.getElementById("textControls").classList.toggle("hidden");
});

function updateCurrentBlock(type) {

    document.querySelectorAll(".blockedStyleElements").forEach(el => {
        el.classList.remove('selected');
    });
    currentBlock = type;
    switch (currentBlock)
    {
        case "HEADING1":
            document.getElementById('HEADING1').classList.add('selected');
            break;
        case "HEADING2":
            document.getElementById('HEADING2').classList.add('selected');
            break;
        case "HEADING3":
            document.getElementById('HEADING3').classList.add('selected');
            break;
        case "HEADING4":
            document.getElementById('HEADING4').classList.add('selected');
            break;
        case "HEADING5":
            document.getElementById('HEADING5').classList.add('selected');
            break;
        case "CODE_BLOCK":
            document.getElementById('CODE_BLOCK').classList.add('selected');
            break;
        case "UNORDERED_LIST":
            document.getElementById('UNORDERED_LIST').classList.add('selected');
            break;
        case "ORDERED_LIST":
            document.getElementById('ORDERED_LIST').classList.add('selected');
            break;
        case "BLOCKQUOTE":
            document.getElementById('BLOCKQUOTE').classList.add('selected');
            break;
    }
}



function updateCurrentInlineBlock(type)
{
    document.querySelectorAll(".styles").forEach(el => {
        el.classList.remove('selected');
    });
    currentInlineBlock = type;
    switch (type)
    {
        case "bold":
            currentInlineBlock = "BOLD_CONTROL";
            document.getElementById('BOLD_CONTROL').classList.add('selected');
            break;
        case "italic":
            currentInlineBlock = "ITALIC_CONTROL";
            document.getElementById('ITALIC_CONTROL').classList.add('selected');
            break;
        case "underline":
            currentInlineBlock = "UNDERLINE_CONTROL";
            document.getElementById('UNDERLINE_CONTROL').classList.add('selected');
            break;
        case "strike":
            currentInlineBlock = "STRIKETHROUGH_CONTROL";
            document.getElementById('STRIKETHROUGH_CONTROL').classList.add('selected');
            break;
        case "mark":
            currentInlineBlock = "MARKED_CONTROL";
            document.getElementById('MARKED_CONTROL').classList.add('selected');
            break;
        case "code-inline":
            currentInlineBlock = "INLINE_CODE";
            document.getElementById('INLINE_CODE').classList.add('selected');
            break;
        case "default-text":
            currentInlineBlock = "DEFAULT_TEXT";
             document.querySelectorAll(".styles").forEach(el => {
                el.classList.remove('selected');
            });
            break;
        
    }
}