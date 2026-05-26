import sys
import hashlib
import hmac
import requests
import urllib3

# Suppress self-signed certificate warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def main():
    base_url = "https://localhost"
    
    # 1. Login
    print("Testing POST /api/v1/auth/login...")
    session = requests.Session()
    login_data = {
        "email": "admin@sovereign.health",
        "password": "changeme"
    }
    response = session.post(f"{base_url}/api/v1/auth/login", json=login_data, verify=False)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    print(f"Cookies: {session.cookies.get_dict()}")
    assert response.status_code == 200, "Login failed!"
    
    # 2. Get me
    print("\nTesting GET /api/v1/auth/me...")
    response = session.get(f"{base_url}/api/v1/auth/me", verify=False)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    assert response.status_code == 200, "Get me failed!"
    
    # 3. Get today
    print("\nTesting GET /api/v1/today...")
    response = session.get(f"{base_url}/api/v1/today", verify=False)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    assert response.status_code == 200, "Get today failed!"
    
    # 4. Get trends/weight_kg
    print("\nTesting GET /api/v1/trends/weight_kg?range=7d...")
    response = session.get(f"{base_url}/api/v1/trends/weight_kg?range=7d", verify=False)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    assert response.status_code == 200, "Get trends/weight_kg failed!"
    
    # 5. Ingest HAE
    print("\nTesting POST /api/v1/ingest/hae...")
    shared_secret = "changeme_generate_with_openssl_rand_hex_32"
    body = b'{"data":{"test":"val"}}'
    signature = hmac.new(
        shared_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        "X-HAE-Signature": signature,
        "Content-Type": "application/json"
    }
    response = requests.post(f"{base_url}/api/v1/ingest/hae", data=body, headers=headers, verify=False)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    assert response.status_code == 200, "Ingest HAE failed!"
    
    print("\nALL PHASE 0 BACKEND TESTS PASSED CONGRATULATIONS!")

if __name__ == "__main__":
    main()
