import os
import asyncio
import asyncpg
import uuid

from datetime import datetime

async def check_and_fix_departments():
    conn = await asyncpg.connect('postgresql://atlas_user:atlas_password@localhost:5433/atlas_db')

    # Check existing establishments
    print("EXISTING ESTABLISHMENTS:")
    establishments = await conn.fetch('SELECT id, name, domain FROM establishment ORDER BY name')
    for est in establishments:
        print(f"  - {est['name']} ({est['domain']}) - ID: {est['id']}")

    print("\nEXISTING DEPARTMENTS:")
    departments = await conn.fetch('SELECT d.name, e.name as establishment_name FROM department d JOIN establishment e ON d.establishment_id = e.id ORDER BY e.name, d.name')
    if departments:
        for dept in departments:
            print(f"  - {dept['establishment_name']}: {dept['name']}")
    else:
        print("  No departments found!")

    # Add common departments to each establishment
    common_departments = [
        'Computer Science',
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biology',
        'Engineering',
        'Business Administration',
        'Economics',
        'Law',
        'Medicine',
        'Literature',
        'History',
        'Psychology'
    ]

    print("\nADDING DEPARTMENTS TO ESTABLISHMENTS...")
    for est in establishments:
        print(f"\n  {est['name']}:")
        for dept_name in common_departments[:6]:  # Add first 6 departments
            # Check if department already exists
            existing = await conn.fetchval(
                'SELECT 1 FROM department WHERE name = $1 AND establishment_id = $2',
                dept_name, est['id']
            )
            if not existing:
                await conn.execute(
                    'INSERT INTO department (id, name, establishment_id, created_at) VALUES ($1, $2, $3, $4)',
                    str(uuid.uuid4()), dept_name, est['id'], datetime.now()
                )
                print(f"    + Added: {dept_name}")
            else:
                print(f"    = Already exists: {dept_name}")

    print("\n✓ Departments setup complete!")
    print("\nYou can now import teachers with CSV using departments like 'Computer Science'")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_and_fix_departments())
