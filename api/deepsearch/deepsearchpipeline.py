from planning import generate_plan
reqID = "test123"

def deepSearchPipeline(query: str, reqID :str):
    fileName_plan = ""
    plan = await generate_plan(user_prompt)
    try:
        reply_json = json.loads(reply)
        if "response" not in reply_json:
            os.makedirs("searchSessions", exist_ok=True)
            fileName_plan = f"searchSessions/{reqID}/{reqID}_planning.json"
            with open(fileName_plan, "w") as f:
                f.write(json.dumps(reply_json, indent=2))
    

    except Exception:
        pass
        print("\n--- Generated Reply ---\n")
        print(reply)


