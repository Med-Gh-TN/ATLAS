import csv
import os
import random

def generate_dummy_csv(num_rows=50):
    filename = "teacher_invites_dummy.csv"
    headers = ["email", "full_name", "department_name"]
    
    # Lists to pull random data from
    first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", 
                   "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", 
                   "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen"]
    
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", 
                  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", 
                  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]
    
    departments = ["Mathematics", "Science", "History", "Literature", "Computer Science", 
                   "Physical Education", "Art", "Music", "Languages", "Geography"]
    
    dummy_data = []
    
    # Generate the requested number of rows
    for _ in range(num_rows):
        first = random.choice(first_names)
        last = random.choice(last_names)
        full_name = f"{first} {last}"
        
        # Create a simple email format: firstname.lastname@example.edu
        email = f"{first.lower()}.{last.lower()}@gmail.com"
        
        department = random.choice(departments)
        
        dummy_data.append([email, full_name, department])
        
    try:
        # Create and write to the CSV
        with open(filename, mode='w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            
            # Write the header row
            writer.writerow(headers)
            
            # Write the dummy data rows
            writer.writerows(dummy_data)
            
        print(f"Success! Generated {num_rows} dummy records in '{filename}'.")
        print(f"File location: {os.path.join(os.getcwd(), filename)}")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # You can change the number '50' below to generate more or fewer rows
    generate_dummy_csv(8)