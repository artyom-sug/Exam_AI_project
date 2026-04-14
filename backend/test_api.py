import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_health():
    response = requests.get("http://localhost:8000/health")
    print(f"Health: {response.json()}")

def test_teacher_login():
    response = requests.post(
        f"{BASE_URL}/teacher/login",
        json={"login": "teacher", "password": "123"}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"Login successful: {data['access_token'][:50]}...")
        return data['access_token']
    else:
        print(f"Login failed: {response.status_code} - {response.text}")
        return None

def test_get_groups(token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/groups", headers=headers)
    print(f"Groups: {response.json()}")

def test_create_group(token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(
        f"{BASE_URL}/groups",
        headers=headers,
        json={"name": "Новая группа", "questions_count": 5, "time_per_question": 30}
    )
    print(f"Created group: {response.json()}")

def test_student_validate():
    response = requests.post(
        f"{BASE_URL}/student/validate",
        json={"fio": "Иванов Иван", "key": "TEST123"}
    )
    print(f"Student validation: {response.json()}")

if __name__ == "__main__":
    print("=" * 50)
    print("Тестирование API")
    print("=" * 50)
    
    test_health()
    
    token = test_teacher_login()
    
    if token:
        test_get_groups(token)
    
    test_student_validate()