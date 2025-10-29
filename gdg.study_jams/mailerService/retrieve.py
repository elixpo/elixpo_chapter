import csv
import pandas as pd
from blackListEmails import cancelledList
def getData():
    df = pd.read_csv("data/data.csv")
    return df 



def FilterData():
    df = getData()
    filtered_df = df[df['Access Code Redemption Status'] == "No"]
    return filtered_df

def getEmailList():
    filtered_df = FilterData()
    email_list = filtered_df['User Email'].tolist()
    return email_list


if __name__ == "__main__":
    all_emails = getEmailList()
    all_emails = [email for email in all_emails if email not in cancelledList]
    print(all_emails)
    print(f"Total emails to send: {len(all_emails)}")