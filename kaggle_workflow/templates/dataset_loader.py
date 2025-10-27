# File: kaggle_workflow/templates/dataset_loader.py

import pandas as pd
import os
from typing import Tuple

def load_csv_dataset(path: str, verbose: bool = True) -> pd.DataFrame:
    """
    Load a CSV dataset into a Pandas DataFrame.

    :param path: Path to the dataset file (CSV)
    :param verbose: If True, print loading info
    :return: DataFrame
    """
    if verbose:
        print(f"[INFO] Loading dataset from: {path}")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Dataset file not found: {path}")
    df = pd.read_csv(path)
    if verbose:
        print(f"[INFO] Dataset loaded: {df.shape[0]} rows, {df.shape[1]} columns")
    return df

def basic_info(df: pd.DataFrame, num_rows: int = 5) -> None:
    """
    Print basic info about the DataFrame: head, info, describe.

    :param df: DataFrame
    :param num_rows: number of rows to show in head()
    """
    print("\n[INFO] Showing first rows:")
    print(df.head(num_rows))
    print("\n[INFO] DataFrame info:")
    print(df.info())
    print("\n[INFO] Statistical description of numerical columns:")
    print(df.describe())

def save_to_csv(df: pd.DataFrame, out_path: str, index: bool = False) -> None:
    """
    Save DataFrame to a CSV file.

    :param df: DataFrame
    :param out_path: Output path for the csv
    :param index: Whether to write row index
    """
    df.to_csv(out_path, index=index)
    print(f"[INFO] DataFrame saved to: {out_path}")

if __name__ == "__main__":
    # Example usage: adjust the path as needed
    input_path = "data/sample.csv"
    output_path = "output/processed.csv"
    df = load_csv_dataset(input_path)
    basic_info(df)
    # (Add your processing here)
    save_to_csv(df, output_path)
