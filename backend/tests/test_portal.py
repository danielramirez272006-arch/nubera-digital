from fastapi.testclient import TestClient
from app.main import app


def test_functional_requirements():
    with TestClient(app) as client:
        # 1. Login como colaborador -> redirige a /consultas
        r_collab = client.post(
            "/api/auth/login",
            json={"email": "ana.garcia@nubera.mx", "password": "Colaborador123!"},
        )
        assert r_collab.status_code == 200
        collab_data = r_collab.json()
        assert collab_data["redirect_to"] == "/consultas"
        assert collab_data["user"]["role"] == "colaborador"
        collab_headers = {"Authorization": f"Bearer {collab_data['access_token']}"}

        # 2. Login como RRHH -> redirige a /dashboard
        r_hr = client.post(
            "/api/auth/login",
            json={"email": "laura.mendoza@nubera.mx", "password": "Rrhh123!"},
        )
        assert r_hr.status_code == 200
        hr_data = r_hr.json()
        assert hr_data["redirect_to"] == "/dashboard"
        assert hr_data["user"]["role"] == "rrhh"
        hr_headers = {"Authorization": f"Bearer {hr_data['access_token']}"}

        # Check 1: «¿Con cuánta anticipación pido vacaciones?» -> 10 días hábiles y cita RH-01
        c1 = client.post(
            "/api/chat",
            json={"question": "¿Con cuánta anticipación pido vacaciones?"},
            headers=collab_headers,
        )
        assert c1.status_code == 200
        d1 = c1.json()
        assert "10 días hábiles" in d1["answer"]
        assert any(cit["policy_code"] == "RH-01" for cit in d1["citations"])

        # Check 2: «¿Cuántos días me quedan?» -> saldo propio de Ana (14 días)
        c2 = client.post(
            "/api/chat",
            json={"question": "¿Cuántos días me quedan?"},
            headers=collab_headers,
        )
        assert c2.status_code == 200
        d2 = c2.json()
        assert "14 días disponibles" in d2["answer"]
        assert "Ana Sofía García López" in d2["answer"]

        # Check 3: «¿Cuántos días me quedan y puedo usarlos el próximo año?» -> saldo + regla de plazo
        c3 = client.post(
            "/api/chat",
            json={"question": "¿Cuántos días me quedan y puedo usarlos el próximo año?"},
            headers=collab_headers,
        )
        assert c3.status_code == 200
        d3 = c3.json()
        assert d3["intent"] == "mixta"
        assert "14 días disponibles" in d3["answer"]
        assert "18 meses" in d3["answer"]
        assert any(cit["policy_code"] == "RH-01" for cit in d3["citations"])

        # Check 4: «¿Cuántos días le quedan a mi compañero?» -> no revela datos de terceros
        c4 = client.post(
            "/api/chat",
            json={"question": "¿Cuántos días le quedan a mi compañero?"},
            headers=collab_headers,
        )
        assert c4.status_code == 200
        d4 = c4.json()
        assert d4["outcome"] == "denegada"
        assert "No tengo permiso" in d4["answer"]
        assert "Carlos Eduardo" not in d4["answer"]

        # Check 5: «¿La empresa da bono por mascotas?» -> sin respaldo y ofrece contactar a RRHH
        c5 = client.post(
            "/api/chat",
            json={"question": "¿La empresa da bono por mascotas?"},
            headers=collab_headers,
        )
        assert c5.status_code == 200
        d5 = c5.json()
        assert d5["needs_hr_escalation"] is True
        assert d5["outcome"] == "escalada_rrhh"
        assert "No se encontró una política aplicable" in d5["answer"]
        assert "RRHH" in d5["answer"]

        # Check 6: Colaborador no puede consultar el dashboard ni sus fechas por API
        dash_denied = client.get("/api/dashboard/report", headers=collab_headers)
        assert dash_denied.status_code == 403
        dates_denied = client.get("/api/dashboard/dates", headers=collab_headers)
        assert dates_denied.status_code == 403

        # Check 7: RRHH puede listar fechas y consultar reportes guardados anteriores
        dates_ok = client.get("/api/dashboard/dates", headers=hr_headers)
        assert dates_ok.status_code == 200
        dates_list = dates_ok.json()
        assert len(dates_list) >= 5

        older_date = dates_list[2]
        rep_ok = client.get(f"/api/dashboard/report?report_date={older_date}", headers=hr_headers)
        assert rep_ok.status_code == 200
        rep_data = rep_ok.json()
        assert rep_data["report_date"] == older_date
        assert len(rep_data["executive_summary"]) > 40
