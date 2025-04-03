import numpy as np

def gauss_elimination(a, b):
    n = len(b)
    
    for i in range(n):
        max_row = i + np.argmax(abs(a[i:, i]))
        if a[max_row, i] == 0:
            raise ValueError("No unique solution exists")
        
        # Swap rows properly
        a[[i, max_row], :] = a[[max_row, i], :]
        b[[i, max_row]] = b[[max_row, i]]

        for j in range(i + 1, n):
            factor = a[j, i] / a[i, i]
            a[j, i:] -= factor * a[i, i:]
            b[j] -= factor * b[i]

    # Back substitution
    x = np.zeros(n)
    for i in range(n - 1, -1, -1):
        x[i] = (b[i] - np.dot(a[i, i + 1:], x[i + 1:])) / a[i, i]
    
    return x

if __name__ == "__main__":
    augmented_matrix = np.array([
        [1, 4, -1, 3], 
        [1, 1, -6, -1], 
        [3, -1, -1, -1]
    ], dtype=float)

    a = augmented_matrix[:, :-1]  
    b = augmented_matrix[:, -1]  

    try:
        solution = gauss_elimination(a, b)
        print("Solutions:", solution)
    except ValueError as e:
        print(e)
