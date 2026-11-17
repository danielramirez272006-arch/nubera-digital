import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

os.environ["DATABASE_URL"] = "sqlite:///./test_portal.db"
os.environ["GOOGLE_DRIVE_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Employee, Balance, LeaveRequest, DocumentAuditAlert
from app.agents.ingestion_agent import _extract_document_metadata, sync_drive_policies
from app.agents.validator_agent import validate_response
from app.agents.analyst_agent import generate_daily_report
from app.agents.payment_schedule import get_next_payment_info


def test_functional_requirements():
    with TestClient(app) as client:
        r_collab = client.post(
            "/api/auth/login",
            json={"email": "ana.garcia@nubera.mx", "password": "Colaborador123!"},
        )
        assert r_collab.status_code == 200
        collab_data = r_collab.json()
        assert collab_data["redirect_to"] == "/consultas"
        collab_headers = {"Authorization": f"Bearer {collab_data['access_token']}"}

        r_hr = client.post(
            "/api/auth/login",
            json={"email": "laura.mendoza@nubera.mx", "password": "Rrhh123!"},
        )
        assert r_hr.status_code == 200
        hr_data = r_hr.json()
        assert hr_data["redirect_to"] == "/dashboard"
        hr_headers = {"Authorization": f"Bearer {hr_data['access_token']}"}

        # 1. Política RH-01
        c1 = client.post("/api/chat", json={"question": "¿Con cuánta anticipación pido vacaciones?"}, headers=collab_headers).json()
        assert "10 días hábiles" in c1["answer"]
        assert any(cit["policy_code"] == "RH-01" for cit in c1["citations"])

        # 2. Saldo propio (dato_personal)
        c2 = client.post("/api/chat", json={"question": "¿Cuántos días me quedan?"}, headers=collab_headers).json()
        assert c2["intent"] == "dato_personal"
        assert "14 días disponibles" in c2["answer"]

        # 3. Mixta sin contradicciones
        c3 = client.post(
            "/api/chat",
            json={"question": "¿Cuántos días me quedan y puedo usarlos el próximo año?"},
            headers=collab_headers,
        ).json()
        assert c3["intent"] == "mixta"
        assert "14 días disponibles" in c3["answer"]
        assert "18 meses" in c3["answer"]
        assert "no puedo responder" not in c3["answer"].lower()
        assert any(cit["policy_code"] == "RH-01" for cit in c3["citations"])

        # 4. Rechazo de datos de terceros
        c4 = client.post("/api/chat", json={"question": "¿Cuántos días le quedan a mi compañero?"}, headers=collab_headers).json()
        assert c4["outcome"] == "denegada"
        assert "No tengo permiso" in c4["answer"]
        assert "Carlos Eduardo" not in c4["answer"]

        # 5. Sin respaldo -> ofrece escalamiento + confirmación de ticket
        c5 = client.post("/api/chat", json={"question": "¿La empresa da bono por mascotas?"}, headers=collab_headers).json()
        assert c5["needs_hr_escalation"] is True
        assert c5["suggested_ticket_summary"]
        t_res = client.post(
            "/api/tickets",
            json={"topic": c5["topic"], "confirmed_summary": c5["suggested_ticket_summary"], "is_sensitive": False},
            headers=collab_headers,
        )
        assert t_res.status_code == 200
        assert t_res.json()["folio"].startswith("TKT-")

        # 6. Pago semanal (viernes) coherente entre calendario, Mis datos y chat (sin quincena)
        me_data = client.get("/api/me/data", headers=collab_headers).json()
        next_pay_api = me_data["employee"]["next_payment_date"]
        assert date.fromisoformat(next_pay_api).weekday() in (3, 4)  # viernes o jueves si hay adelanto
        c_pay = client.post("/api/chat", json={"question": "¿Cuándo es mi próximo pago semanal?"}, headers=collab_headers).json()
        assert "viernes" in c_pay["answer"].lower()
        assert "quincena" not in c_pay["answer"].lower()

        # 7. RBAC en dashboard y documentos
        assert client.get("/api/dashboard/report", headers=collab_headers).status_code == 403
        assert client.get("/api/documents", headers=collab_headers).status_code == 403
        dates_list = client.get("/api/dashboard/dates", headers=hr_headers).json()
        assert len(dates_list) >= 5
        rep_old = client.get(f"/api/dashboard/report?report_date={dates_list[2]}", headers=hr_headers)
        assert rep_old.status_code == 200


def test_metadata_extraction_and_idempotent_sync():
    rh01_text = (
        "Vacaciones y descansos obligatorios\nNubera Digital\n"
        "Identificador RH-01\nVersión 1.1\n"
        "Fecha de vigencia del caso 17 de noviembre de 2026\n"
        "Responsable Operaciones de RRHH\nÁmbito Personal de Nubera Digital"
    )
    m1 = _extract_document_metadata(rh01_text, "RH-01 Vacaciones y descansos obligatorios")
    assert m1["policy_code"] == "RH-01"
    assert m1["version"] == "1.1"
    assert m1["effective_date"] == "17 de noviembre de 2026"
    assert m1["owner"] == "Operaciones de RRHH"

    rh02_text = (
        "Permisos y licencias\nNubera Digital\n"
        "Identificador RH-02\nVersión 1.1\n"
        "Fecha de vigencia del caso 17 de noviembre de 2026\n"
        "Responsable Relaciones Laborales\nÁmbito Personal de Nubera Digital"
    )
    m2 = _extract_document_metadata(rh02_text, "RH-02 Permisos y licencias")
    assert m2["policy_code"] == "RH-02"
    assert m2["version"] == "1.1"
    assert m2["owner"] == "Relaciones Laborales"

    # Metadatos faltantes no se inventan
    missing = _extract_document_metadata("Documento sin encabezado formal", "Sin codigo")
    assert missing["version"] == ""
    assert missing["owner"] == ""

    db = SessionLocal()
    try:
        s1 = sync_drive_policies(db)
        s2 = sync_drive_policies(db)
        assert s2["added"] == 0 and s2["updated"] == 0 and s2["deleted"] == 0
    finally:
        db.close()


def test_validator_and_analyst_cross_month():
    db = SessionLocal()
    try:
        emp = db.query(Employee).filter(Employee.email == "ana.garcia@nubera.mx").first()
        # Validador con dato_personal y contradicción en mixta
        v_ok = validate_response(emp, "dato_personal", "Tienes 14 días disponibles.", [], ["14"], False)
        assert v_ok["valid"] is True
        v_bad = validate_response(emp, "mixta", "Tienes 14 días disponibles. No puedo responder esa pregunta.", [{"policy_code": "RH-01"}], ["14"], False)
        assert v_bad["valid"] is False

        # Incapacidad que inicia antes del mes y cruza cambio de mes
        target_d = date(2026, 11, 10)
        lr_cross = LeaveRequest(
            employee_id=emp.id,
            request_type="incapacidad",
            start_date=date(2026, 10, 28),
            end_date=date(2026, 11, 5),
            days_count=9,
            status="aprobada",
            reason="Prueba cruce de mes",
        )
        db.add(lr_cross)
        db.commit()
        rep = generate_daily_report(db, target_d)
        # Del 1 al 5 de noviembre son 5 días acumulados en noviembre
        assert rep.monthly_disability_days >= 5
    finally:
        db.close()
