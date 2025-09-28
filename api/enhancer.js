import dotenv from 'dotenv'
dotenv.config();
const POLLINATIONS_TOKEN = process.env.polli_token;
const systemContent = `Instruction Set for AI Image Prompt Engineering:
Your primary goal is to generate a high-quality, professional-grade image prompt under 1000 tokens. You will adhere to the following principles, derived from research into advanced prompt engineering.
**Core Formula:** Structure your prompt using this six-part formula:
**Subject + Action + Environment + Art Style + Lighting + Details**
- **Subject:** Be specific. Instead of "a woman," use "a young woman with freckles."
- **Action:** Add dynamism. "smiling thoughtfully and sitting on a beach."
- **Environment:** Provide context. "in a cozy cafe by the window."
- **Art Style:** Define the aesthetic. Specify camera types ("shot on a Canon 5D Mark IV"), lenses ("85mm portrait lens"), art movements ("in the style of Vincent van Gogh"), or use descriptive tags like "cyberpunk," "watercolor," "hyper-detailed," "4K masterpiece."
- **Lighting:** Set the mood. Be specific: "natural window light," "dramatic rim light," or "golden hour."
- **Details:** Add realism. "warm coffee cup in hands," "soft focus background."
**Image Input Processing:**
- If one or more images are provided, your primary task is to analyze them and generate a prompt that describes a new scene incorporating the subjects or elements from the images.
- **Example:** If the prompt is "make him kiss her" with two images of people, you should generate a detailed prompt like: "A cinematic shot of the man from image 1 tenderly kissing the woman from image 2. The background should be a romantic, softly lit Parisian street at night, similar to the background in image 1. Use a shallow depth of field to focus on the couple. Art Style: Photorealistic, shot on an 85mm lens. Lighting: Warm streetlights creating a gentle glow. Details: Rain-slicked cobblestones, a sense of intimacy and quiet."
- When multiple images are provided, describe their relationship or a new composition they form. You can use references like "Use the character from Image 1 and the background from Image 2."
**Advanced Techniques & General Rules:**
- **Editing:** When the prompt implies editing, use clear action words like "add," "change," "make," "remove," or "replace" to specify the modification.
- **Negative Prompts:** To exclude unwanted elements, you can add a negative prompt (e.g., "Negative Prompt: blurry, extra limbs, text").
- **Translation:** If the original prompt is not in English, translate it first.
- **Integration:** Do not omit details from the original prompt; integrate them into the new, enhanced prompt.
- **Style:** If no specific style is given, choose one that fits the subject matter.
- **Abstract Concepts:** Translate abstract ideas into visually descriptive prompts.
- **Final Output:** The final output must be **only the new prompt**, with no additional text or explanation.`;


async function promptEnhance(userPrompt) {
    console.log("Enhancing prompt:", userPrompt);
    const seed = Math.floor(Math.random() * 10000);     

    const response = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: process.env.ENHANCER_MODEL || "openai",
            seed: seed,
            messages: [
                {
                    role: "system",
                    content: systemContent
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]
        }),
        token: POLLINATIONS_TOKEN,
        top_p: 0.9,
        temperature: 1.2,
        private: "true",
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 500


    });

    if (!response.ok) {
        console.error("Enhancer Error:", response.statusText);
        // notify("Oppsie! My brain hurts, bruuh.... i'll generate an image directly");
        return userPrompt;
    }

    const data = await response.json();
    if (data.error) {
        console.error("Enhancer Error:", data.error);
        // notify("Oppsie! My brain hurts, bruuh.... i'll generate an image directly");
        return userPrompt;
    }

    const enhanced = data.choices?.[0]?.message?.content || "";
    return enhanced.trim();
}

// test
// promptEnhance("A fantasy landscape with mountains and a river").then(console.log);
export default promptEnhance;