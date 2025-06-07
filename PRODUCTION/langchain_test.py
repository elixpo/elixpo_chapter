from langchain_community.chat_models import ChatOpenAI

llm = ChatOpenAI(
    openai_api_base="https://search.pollinations.ai/v1",  
    openai_api_key="elixposearch", 
)

response = llm.invoke("What is the latest news of France?")
print(response.content)
