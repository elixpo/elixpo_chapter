let url = "https://apisearch.ext.io/v1/completions"
const messagesForApi = [{ role: 'system', content: "Give me a detailed response!" }, { role: 'user', content: "news from germany" }];

    const requestBody = {
        model: "openai",
        messages: messagesForApi, 
        stream: false,
        web_search: true,
        deep_research: false
    };

const response = fetch (url, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody)
}).then(res => res.json())
.then(data => {
        console.log("Response from API:", data);
        return data;
    })
    .catch(error => {
        console.error("Error calling API:", error);
        return { error: "Error calling API" };
    });
