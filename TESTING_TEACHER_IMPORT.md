# ATLAS - Admin Testing Guide: Teacher CSV Import (US-05)

## 📌 Context
ATLAS operates on a strict referential integrity model. To prevent malicious or unauthorized teacher accounts from being created, the system validates the email domains and department names in the uploaded CSV against the PostgreSQL database. 

Before you can test the CSV import in the UI, you must seed your local database with a test Establishment and its corresponding Departments.

## 🛑 Prerequisites
1. Your Docker infrastructure (`docker-compose up -d`) must be actively running.
2. Your Next.js frontend and FastAPI backend must be running.
3. You must be logged into the frontend with an **Admin** account.

---

## 🛠️ Step 1: Access the Database Container

1. Open your terminal or Command Prompt (CMD).
2. Navigate to the root directory of the project (where the `docker-compose.yml` file is located).
3. Execute the following command to open a PostgreSQL session inside the running container:

```bash
docker-compose exec db psql -U atlas_user -d atlas_db

```

*You should now see a prompt that looks like `atlas_db=#`.*

---

## 🏛️ Step 2: Seed the Test Establishment

Copy the following SQL command and paste it into the `atlas_db=#` prompt, then press Enter.

*(Note: Use **Right-Click -> Paste** instead of `Ctrl+V` to avoid terminal syntax errors).*

```sql
INSERT INTO establishment (id, name, domain) 
VALUES (gen_random_uuid(), 'Atlas Test University', 'atlas.edu')
RETURNING id;

```

**⚠️ CRITICAL ACTION:** The terminal will output a UUID (e.g., `2523d7b2-932b-4757-8d7c-58f1119d29c5`). **Copy this exact ID string.** You will need it for the next step.

---

## 📚 Step 3: Seed the Departments

Before copying the code below, replace `<COPIED_ID>` with the UUID you just copied from Step 2. Keep the single quotes `' '` around the ID.

*Example of a correct line: `(gen_random_uuid(), '2523d7b2-932b-4757-8d7c-58f1119d29c5', 'Computer Science', NOW()),*`

Paste your modified block into the terminal and press Enter:

```sql
INSERT INTO department (id, establishment_id, name, created_at) VALUES 
(gen_random_uuid(), '<COPIED_ID>', 'Computer Science', NOW()),
(gen_random_uuid(), '<COPIED_ID>', 'Geography', NOW()),
(gen_random_uuid(), '<COPIED_ID>', 'History', NOW()),
(gen_random_uuid(), '<COPIED_ID>', 'Physical Education', NOW()),
(gen_random_uuid(), '<COPIED_ID>', 'Languages', NOW()),
(gen_random_uuid(), '<COPIED_ID>', 'Science', NOW()),
(gen_random_uuid(), '<COPIED_ID>', 'Art', NOW());

```

You should see an output confirming `INSERT 0 7`.

Once confirmed, type the following command to safely exit the database:

```sql
\q

```

---

## 🧪 Step 4: Execute the UI Test

Your database is now properly seeded and matches the structural constraints of the backend.

1. Open your browser and navigate to the Admin Import UI:
[http://localhost:3000/admin/teachers/import](https://www.google.com/search?q=http://localhost:3000/admin/teachers/import)
2. Drag and drop the provided `teachers.csv` file.
3. Verify the preview table renders correctly.
4. Click Submit.
5. The system should successfully bypass the domain validation errors and report a successful batch import.

