# Informe de Investigación y Políticas de Recursos Humanos — Nubera Digital

**Proyecto:** Mini Proyecto #2 · Portal de consulta de políticas de RRHH con RAG multiagente  
**Empresa ficticia:** Nubera Digital (Servicios Tecnológicos · Ciudad de México, México)  
**Plantilla simulada:** 50 colaboradores del sector privado · 3 meses de movimientos históricos  
**Versión documental:** 1.1 · **Fecha de vigencia del caso:** 17 de noviembre de 2026  
**Documento base conservado:** `Investigacion y politicas de RRHH - Nubera Digital actualizado.docx` (anexos técnicos separados al Informe Técnico en [INFORME_TECNICO_NUBERA_DIGITAL.md](INFORME_TECNICO_NUBERA_DIGITAL.md))

---

## 1. Alcance del caso y metodología de investigación

### 1.1 Contexto organizacional
**Nubera Digital** es una empresa ficticia de servicios tecnológicos con sede en la Ciudad de México, conformada por **50 colaboradores simulados** distribuidos en áreas operativas, de tecnología, producto y soporte administrativo, bajo el régimen laboral del sector privado en México. El departamento de Recursos Humanos recibe de manera recurrente consultas sobre vacaciones, permisos, incapacidades, pagos semanales, aguinaldo, teletrabajo, beneficios, evaluación de desempeño, ética y privacidad, cuya información se encontraba dispersa en documentos ofimáticos, PDFs y hojas de cálculo.

El presente informe constituye la **Fase 1 (Investigación a profundidad)** del portal interno de RRHH. Su objetivo es establecer el marco normativo federal vigente en México para los **10 dominios obligatorios** de gestión de personas, definir las reglas y beneficios internos de la empresa ficticia (siempre iguales o superiores al mínimo legal) y estructurar un corpus documental versionado listo para ser indexado por un sistema RAG (Retrieval-Augmented Generation) sin mezclar políticas generales con registros personales confidenciales.

### 1.2 Metodología y criterios editoriales
1. **Revisión de fuentes primarias federales:** se analizaron la Ley Federal del Trabajo (LFT) y su reforma transitoria sobre jornada laboral de 2026, la Ley del Seguro Social (LSS) y lineamientos del IMSS, las normas oficiales de la STPS (`NOM-035-STPS-2018` y `NOM-037-STPS-2023`), el Modelo de protocolo de la STPS para prevenir y atender la violencia laboral, y la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
2. **Separación explícita entre ley y beneficio interno:** en cada dominio se identifica primero el piso legal obligatorio y después la prestación o regla operativa de Nubera Digital, documentando explícitamente la mejora otorgada.
3. **Diseño orientado a recuperación RAG:** cada política cuenta con identificador único (`RH-01` a `RH-10`), título, versión (`1.1`), fecha de vigencia (`17 de noviembre de 2026`), responsable funcional y encabezados homogéneos (*Fundamento normativo*, *Política de la empresa*, *Cómo se aplica*, *Responsabilidades*, *Preguntas frecuentes* e *Historial de cambios*) para favorecer la fragmentación semántica y la citación verificable.
4. **Frontera entre corpus documental y datos privados:** las políticas generales viven en Google Drive y son consultables por el agente de políticas; los saldos individuales, solicitudes, fechas de evaluación, recibos, certificados médicos y expedientes de denuncias residen exclusivamente en registros estructurados con control de acceso por sesión y rol, fuera del corpus RAG.

---

## 2. Resumen comparativo: Obligaciones legales vs. Beneficios internos

La siguiente tabla sintetiza la distinción entre el mínimo exigido por la legislación federal mexicana y la política adoptada por **Nubera Digital** en cada dominio:

| Código | Dominio | Obligación legal (México) | Beneficio / Regla interna (Nubera Digital) | Diferencia documentada |
|---|---|---|---|---|
| **RH-01** | Vacaciones y descansos | 12 días al 1.er año (+2 por año hasta 5.º; +2 cada 5 años); prima mínima 25 %; disfrute dentro de 6 meses tras aniversario (LFT arts. 74–81). | **15 días** al 1.er y 2.º aniversario (o mínimo legal si es mayor desde 3.er año); **prima del 30 %**; aviso administrativo de 10 días hábiles. | +3 días en año 1, +1 día en año 2 y +5 % de prima vacacional sobre el mínimo legal. |
| **RH-02** | Permisos y licencias | Maternidad: 6 semanas antes y 6 después del parto; paternidad: 5 días laborables pagados (LFT arts. 132 XXVII Bis y 170). | **Paternidad: 10 días** laborables pagados; **duelo: 3 días**; **matrimonio: 2 días**; **estudio: hasta 2 días/año** pagados; permiso sin goce por acuerdo escrito. | Duplica paternidad (+5 días) y añade licencias pagadas internas por duelo, matrimonio y estudio. |
| **RH-03** | Incapacidades | Enfermedad general: IMSS subsidia 60 % del SDC desde el 4.º día. Riesgo de trabajo: 100 % desde el 1.er día (LSS arts. 58, 96–98). | En enfermedad general certificada, **Nubera paga días 1 a 3 al 100 %** del salario ordinario; días 4+ siguen subsidio IMSS (60 %). | Cubre el periodo de carencia de 3 días que el IMSS no subsidia en enfermedad general. |
| **RH-04** | Jornada y teletrabajo | Máximo semanal transitorio de 48 h en 2026 (baja gradual a 40 h en 2030). Teletrabajo legal: >40 % fuera del centro (LFT arts. 58–68, 330-A–K; NOM-037). | **Jornada ordinaria de 40 h/semana** (L–V, 9:00–18:00 con 1 h de comida); esquema híbrido hasta **2 días/semana** en casa para puestos elegibles. | Adelanta la jornada de 40 horas desde 2026 y formaliza flexibilidad híbrida. |
| **RH-05** | Remuneración y pagos | Pago máximo semanal (material) o quincenal; aguinaldo mínimo de 15 días antes del 20 de diciembre (LFT arts. 82–89, 110). | Pago **semanal cada viernes** (adelanto al día hábil anterior si hay cierre bancario); **aguinaldo de 20 días** programado el 15 de diciembre. | +5 días de aguinaldo y programación anticipada al 15 de diciembre. |
| **RH-06** | Beneficios y capacitación | Seguridad social obligatoria y capacitación laboral (LFT art. 132, 153-A y ss.; LSS). | **Seguro médico complementario** (consultas, urgencias, hospitalización según póliza) y presupuesto de formación de hasta **MXN 6,000/año**. | Prestaciones extralegales adicionales al régimen obligatorio del IMSS. |
| **RH-07** | Ingreso y separación | Periodo a prueba ordinario hasta 30 días por escrito; reglas de renuncia, rescisión y despido injustificado (LFT arts. 25, 39-A–E, 47–50, 162). | Inducción estructurada (contrato, equipo, accesos); cortesía operativa de **10 días hábiles** de preaviso en renuncia (sin condicionar finiquito). | Estandariza onboarding y cortesía de entrega sin restringir derechos de liquidación/finiquito. |
| **RH-08** | Desempeño y carrera | Igualdad, capacitación y reglas de preferencia/ascenso; una evaluación no es causal automática de rescisión (LFT arts. 3, 56, 153-A, 154–159). | **Dos ciclos semestrales (junio y diciembre)** sobre objetivos, calidad y colaboración; derecho a retroalimentación y revisión ante Desarrollo de Talento. | Proceso formal documentado con mecanismo de revisión y planes de mejora. |
| **RH-09** | Conducta y denuncias | Prevención y atención de violencia laboral, acoso y hostigamiento (LFT arts. 3 Bis, 132 XXXI; NOM-035-STPS-2018; Protocolo STPS). | Prohibición estricta de discriminación y represalias; canal privado de Ética / Relaciones Laborales; **acuse de recibo en 2 días hábiles** y vía alterna ante conflicto de interés. | Define SLA de atención (2 días hábiles) y gobernanza con Comité de Ética. |
| **RH-10** | Privacidad de datos | Deber de información, finalidades, transferencia y derechos ARCO (LFPDPPP). | Aviso académico de privacidad para Nubera Digital (CDMX); acceso individual al propio expediente y canal de Privacidad para derechos ARCO. | Establece trazabilidad de datos del portal y requisitos previos a operación real. |

---

## 3. Desarrollo normativo y operativo por dominio (RH-01 a RH-10)

### 3.1 RH-01 · Vacaciones y descansos obligatorios
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Operaciones de RRHH`.
- **Fundamento normativo:** LFT, artículos 74 a 81. Al cumplir el primer año de servicios corresponden al menos 12 días laborables, incrementando 2 días por cada año subsecuente hasta llegar a 20 días en el quinto año, y posteriormente 2 días por cada cinco años de servicio. La prima vacacional mínima legal es del 25 %. El disfrute debe concederse dentro de los seis meses siguientes al cumplimiento del año de servicios.
- **Política de Nubera Digital:** Otorga **15 días laborables** en el primer y segundo aniversario (en lugar de 12 y 14) y aplica el mínimo legal a partir del tercer aniversario (16, 18, 20, 22, 24, 26 días según antigüedad). La prima vacacional interna es del **30 %**. Los periodos se calculan por fecha de aniversario (pudiendo cruzar año calendario) y nunca se sustituyen por pago en efectivo salvo en terminación de la relación laboral.
- **Procedimiento operativo:** La solicitud se registra en el portal con **10 días hábiles de anticipación** como regla administrativa. La jefatura valida cobertura operativa y RRHH confirma saldo y fechas. Cuando el plazo de 6 meses esté próximo o vencido, el colaborador debe contactar a Operaciones de RRHH para agendar el disfrute sin perder el derecho.

### 3.2 RH-02 · Permisos y licencias
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Relaciones Laborales`.
- **Fundamento normativo:** LFT, artículos 132 fracción XXVII Bis y 170. La licencia de maternidad comprende ordinariamente seis semanas antes y seis semanas después del parto (con ajustes permitidos por ley) y la licencia de paternidad por nacimiento o adopción otorga 5 días laborables con goce de sueldo.
- **Política de Nubera Digital:** Concede **10 días laborables pagados por paternidad**, **3 días laborables pagados por duelo** (pareja, madre, padre, hija, hijo o hermano), **2 días laborables pagados por matrimonio** y **hasta 2 días de estudio pagados al año** con autorización previa. Los permisos sin goce de sueldo requieren acuerdo escrito y no sustituyen ni reducen licencias protegidas por la ley.
- **Procedimiento operativo:** Se registran tipo y fechas en el portal. En duelo o emergencia se avisa a la brevedad posible y la documentación comprobatoria se entrega por el canal privado de RRHH.

### 3.3 RH-03 · Procedimiento de incapacidades
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Seguridad y Salud`.
- **Fundamento normativo:** Ley del Seguro Social, artículos 58 y 96 a 98. Por enfermedad general certificada, el IMSS otorga un subsidio equivalente al 60 % del último salario diario de cotización a partir del cuarto día, sujeto a requisitos de semanas cotizadas. Por riesgo de trabajo calificado, el subsidio es del 100 % del salario de cotización desde el primer día.
- **Política de Nubera Digital:** Como prestación interna en enfermedad general certificada, Nubera cubre los **primeros tres días al 100 % del salario ordinario**. Así, ante una incapacidad de 5 días por enfermedad general, la empresa paga los días 1 a 3 al 100 % y el IMSS puede subsidiar los días 4 y 5 al 60 % conforme a elegibilidad.
- **Procedimiento operativo:** Aviso inmediato a la jefatura y entrega del certificado médico por el canal privado de RRHH (nunca se exige exponer diagnósticos clínicos en el chat). RRHH captura tipo y fechas; Nómina valida el tratamiento económico y Seguridad y Salud coordina accidentes de trabajo.

### 3.4 RH-04 · Jornada, asistencia y teletrabajo
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Operaciones de RRHH`.
- **Fundamento normativo:** LFT, artículos 58 a 68 y 330-A a 330-K, decreto de jornada laboral y `NOM-037-STPS-2023`. El límite transitorio semanal de jornada ordinaria es de 48 horas en 2026 (descendiendo a 46 en 2027, 44 en 2028, 42 en 2029 y 40 en 2030). El teletrabajo legal aplica cuando más del 40 % del tiempo laboral se realiza fuera del centro de trabajo.
- **Política de Nubera Digital:** Establece jornada ordinaria diurna de **40 horas semanales**, de lunes a viernes, de 9:00 a 18:00 h con una hora libre para comer. Los puestos elegibles pueden trabajar a distancia **hasta dos días por semana** con aprobación. Si un esquema excede el 40 % fuera de oficina, RRHH formaliza condiciones legales, equipo, apoyos, seguridad y desconexión digital.
- **Procedimiento operativo:** Registro diario de entrada y salida; aclaración de marcas ante RRHH; registro de todas las horas extraordinarias efectivamente laboradas (remuneradas al doble dentro del límite legal y al triple el excedente conforme a la LFT).

### 3.5 RH-05 · Política salarial y calendario de pagos
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Nómina`.
- **Fundamento normativo:** LFT, artículos 82 a 89 y 110. El intervalo de pago no excede una semana para trabajo material ni quince días para el resto del personal. El aguinaldo mínimo legal es de 15 días de salario y debe pagarse antes del 20 de diciembre, con proporcionalidad al tiempo laborado.
- **Política de Nubera Digital:** Paga de forma **semanal cada viernes**; en caso de cierre bancario o día inhábil, el depósito se adelanta al día hábil anterior. El **aguinaldo interno equivale a 20 días de salario base diario** por año completo y se programa para el **15 de diciembre** (o día hábil anterior). Solo proceden deducciones autorizadas por ley, desglosadas en el recibo individual.

### 3.6 RH-06 · Catálogo de beneficios
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Compensación y Beneficios`.
- **Fundamento normativo:** LFT, artículos 132 y 153-A y siguientes, y Ley del Seguro Social.
- **Política de Nubera Digital:** Además de las prestaciones de ley, ofrece un programa de **cobertura médica complementaria** para personal activo (consultas, urgencias y hospitalización conforme a red, deducibles y exclusiones de la póliza; dependientes sujetos a inscripción) y un **presupuesto de capacitación de hasta MXN 6,000 anuales** por colaborador para cursos vinculados al puesto, previa autorización y comprobación del gasto.

### 3.7 RH-07 · Incorporación y separación del personal
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Relaciones Laborales`.
- **Fundamento normativo:** LFT, artículos 25, 39-A a 39-E, 47 a 50 y 162. El periodo a prueba ordinario, cuando procede, es de hasta 30 días y debe constar por escrito con salario, prestaciones y seguridad social plenas.
- **Política de Nubera Digital:** Entrega contrato, equipo, accesos y plan de inducción al ingreso. En renuncia voluntaria solicita **10 días hábiles de preaviso** como cortesía operativa sin condicionarlo al pago del finiquito. En separaciones, Nómina desglosa salarios pendientes y proporcionales (aguinaldo, vacaciones y prima); ante despido injustificado, Relaciones Laborales revisa indemnización, prima de antigüedad y conceptos aplicables de forma individual y privada.

### 3.8 RH-08 · Evaluación del desempeño y carrera
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Desarrollo de Talento`.
- **Fundamento normativo:** LFT, artículos 3, 56, 153-A y 154 a 159. El desempeño no constituye por sí mismo causal automática de rescisión.
- **Política de Nubera Digital:** Realiza **dos ciclos anuales (junio y diciembre)** evaluando objetivos acordados, calidad del trabajo y colaboración. Cada colaborador accede a retroalimentación, puede solicitar revisión con evidencia ante Desarrollo de Talento y, de acordarse plan de mejora, se documentan metas, recursos y fechas. Los expedientes son confidenciales.

### 3.9 RH-09 · Código de conducta y protocolo de denuncias
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Comité de Ética` (publicado en formato **PDF** en Drive).
- **Fundamento normativo:** LFT, artículos 3 Bis y 132 fracción XXXI, `NOM-035-STPS-2018` y Modelo de protocolo de la STPS para prevenir, atender y erradicar la violencia laboral.
- **Política de Nubera Digital:** Prohíbe discriminación, violencia laboral, acoso sexual, hostigamiento y represalias. La denuncia confidencial puede ingresarse por el formulario privado de Ética o ante Relaciones Laborales; si la persona denunciada recibe quejas, se activa la vía alterna ante el Comité de Ética sin su participación. El Comité **acusa recibo dentro de dos días hábiles**, valora medidas de protección, escucha a las partes y documenta el cierre. El colaborador conserva siempre su derecho a acudir a instancias externas.

### 3.10 RH-10 · Aviso de privacidad para colaboradores
- **Metadatos oficiales:** Versión `1.1` · Vigencia `17 de noviembre de 2026` · Responsable: `Responsable de Privacidad`.
- **Fundamento normativo:** Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
- **Política de Nubera Digital:** Identifica a Nubera Digital como responsable simulado en Ciudad de México para fines académicos del prototipo. Describe los datos tratados (identificadores, asistencia, saldos, solicitudes y registros de consultas) y habilita el canal de Privacidad de RRHH para ejercer derechos **ARCO** (acceso, rectificación, cancelación y oposición). Advierte expresamente que, antes de cualquier despliegue con personas reales, debe completarse la razón social, domicilio real y mecanismos legales operativos.

---

## 4. Calendarios 2026, catálogo de políticas y publicación en Google Drive

### 4.1 Calendario federal de descansos obligatorios 2026 (LFT art. 74 · Anexo RH-01 / RH-11)

| Fecha (2026) | Motivo oficial | Fundamento |
|---|---|---|
| 1 de enero | Año Nuevo | LFT art. 74, fracc. I |
| 2 de febrero | Conmemoración del 5 de febrero (Día de la Constitución) | LFT art. 74, fracc. II |
| 16 de marzo | Conmemoración del 21 de marzo (Natalicio de Benito Juárez) | LFT art. 74, fracc. III |
| 1 de mayo | Día del Trabajo | LFT art. 74, fracc. IV |
| 16 de septiembre | Independencia de México | LFT art. 74, fracc. V |
| 16 de noviembre | Conmemoración del 20 de noviembre (Revolución Mexicana) | LFT art. 74, fracc. VI |
| 25 de diciembre | Navidad | LFT art. 74, fracc. VIII |

El trabajo en día de descanso obligatorio se remunera conforme al artículo 75 de la LFT. Adicionalmente, la hoja **Pagos 2026** (`RH-12`) contempla **52 pagos semanales los viernes** más **1 pago de aguinaldo programado el 15 de diciembre**, con ajuste del pago semanal del viernes 25 de diciembre al **jueves 24 de diciembre** por cierre bancario.

### 4.2 Catálogo verificado de políticas (repositorio local y Google Drive)
Todos los documentos oficiales de la versión `1.1` se conservan en el repositorio en [docs/politicas/](politicas/) y se encuentran sincronizados y activos en la carpeta corporativa de **Google Drive** configurada mediante variables de entorno (`GOOGLE_DRIVE_FOLDER_ID`, sin exponer credenciales), abarcando los **3 formatos exigidos** (**Google Docs**, **PDF** y **Google Sheets**):

| Código | Título verificado | Versión | Vigencia | Responsable | Formato en Drive | Archivo en repositorio |
|---|---|---|---|---|---|---|
| **RH-01** | Vacaciones y descansos obligatorios | 1.1 | 17 nov 2026 | Operaciones de RRHH | Google Docs | [RH-01](politicas/RH-01%20Vacaciones%20y%20descansos%20obligatorios.docx) |
| **RH-02** | Permisos y licencias | 1.1 | 17 nov 2026 | Relaciones Laborales | Google Docs | [RH-02](politicas/RH-02%20Permisos%20y%20licencias.docx) |
| **RH-03** | Procedimiento de incapacidades | 1.1 | 17 nov 2026 | Seguridad y Salud | Google Docs | [RH-03](politicas/RH-03%20Procedimiento%20de%20incapacidades.docx) |
| **RH-04** | Jornada asistencia y teletrabajo | 1.1 | 17 nov 2026 | Operaciones de RRHH | Google Docs | [RH-04](politicas/RH-04%20Jornada%20asistencia%20y%20teletrabajo.docx) |
| **RH-05** | Política salarial y calendario de pagos | 1.1 | 17 nov 2026 | Nómina | Google Docs | [RH-05](politicas/RH-05%20Pol%C3%ADtica%20salarial%20y%20calendario%20de%20pagos.docx) |
| **RH-06** | Catálogo de beneficios | 1.1 | 17 nov 2026 | Compensación y Beneficios | Google Docs | [RH-06](politicas/RH-06%20Cat%C3%A1logo%20de%20beneficios.docx) |
| **RH-07** | Incorporación y separación del personal | 1.1 | 17 nov 2026 | Relaciones Laborales | Google Docs | [RH-07](politicas/RH-07%20Incorporaci%C3%B3n%20y%20separaci%C3%B3n%20del%20personal.docx) |
| **RH-08** | Evaluación del desempeño y carrera | 1.1 | 17 nov 2026 | Desarrollo de Talento | Google Docs | [RH-08](politicas/RH-08%20Evaluaci%C3%B3n%20del%20desempe%C3%B1o%20y%20carrera.docx) |
| **RH-09** | Código de conducta y protocolo de denuncias | 1.1 | 17 nov 2026 | Comité de Ética | **PDF** | [RH-09 PDF](politicas/RH-09%20Codigo%20de%20conducta.pdf) · [DOCX](politicas/RH-09%20C%C3%B3digo%20de%20conducta%20y%20protocolo%20de%20denuncias.docx) |
| **RH-10** | Aviso de privacidad para colaboradores | 1.1 | 17 nov 2026 | Responsable de Privacidad | Google Docs | [RH-10](politicas/RH-10%20Aviso%20de%20privacidad%20para%20colaboradores.docx) |
| **RH-11 / RH-12** | Nubera Digital · Calendarios de RRHH 2026 | 1.1 | 2026-01-02 | Nómina / RRHH | **Google Sheets** (`Pagos 2026`, `Feriados 2026`) | [RH-11 CSV](politicas/RH-11%20Calendario%20de%20feriados%202026.csv) · [RH-12 CSV](politicas/RH-12%20Calendario%20de%20pagos%202026.csv) |

*Verificación en vivo del corpus indexado:* `11` documentos activos (`71` fragmentos indexados en MySQL, `0` alertas activas), con las dos pestañas del Google Sheet (`Pestaña: Pagos 2026` y `Pestaña: Feriados 2026`) accesibles desde el portal.

---

## 5. Criterios de aplicación, control de versiones y pruebas de aceptación

### 5.1 Casos críticos de interpretación normativa
1. **Vacaciones y antigüedad:** un colaborador con 1 o 2 años cumplidos recibe 15 días en Nubera; al 3.er aniversario recibe 16 días porque el mínimo legal supera el beneficio base. Para preguntas sobre saldo disponible o uso el año siguiente, el portal debe consultar la fecha de aniversario, los días reservados en solicitudes pendientes y el plazo de 6 meses antes de emitir una respuesta.
2. **Incapacidad de 5 días por enfermedad general:** el portal explica que Nubera paga días 1 a 3 al 100 % y el IMSS subsidia días 4 y 5 al 60 % sujeto a elegibilidad, citando `RH-03` y derivando cálculos individuales a Nómina.
3. **Renuncia y despido:** en renuncia informa la cortesía de 10 días hábiles y conceptos de finiquito; en despido injustificado evita estimar montos individuales sin hechos completos y deriva a Relaciones Laborales citando `RH-07`.
4. **Confidencialidad y ausencia de respaldo:** ante solicitudes sobre terceros (saldos, salarios) rechaza la consulta sin fuga de datos; ante prestaciones inexistentes (ej. bono por mascotas) declara ausencia de política y ofrece escalamiento a RRHH.

### 5.2 Gobernanza y pruebas iniciales de aceptación
Cada área responsable revisa su documento ante cambios legales o internos, actualiza versión y vigencia, y el agente de ingesta retira del índice las versiones sustituidas. Los seis casos base de aceptación (anticipación de vacaciones `RH-01`, consulta mixta saldo + año siguiente, reparto de incapacidad de 5 días `RH-03`, bloqueo de terceros, consulta sin respaldo por bono de mascotas y conteo agregado de ausencias exclusivo para RRHH) se expanden en el banco oficial de **45 preguntas** documentado en [docs/evaluation/EVALUATION_45_SUMMARY.md](evaluation/EVALUATION_45_SUMMARY.md).

---

## 6. Fuentes oficiales consultadas

1. **Cámara de Diputados del H. Congreso de la Unión.** *Ley Federal del Trabajo (LFT).* Texto vigente consultado para vacaciones y descansos obligatorios (arts. 74–81), permisos y maternidad/paternidad (arts. 132 XXVII Bis y 170), jornada y teletrabajo (arts. 58–68 y 330-A–330-K), salario y aguinaldo (arts. 82–89 y 110), contratación y separación (arts. 25, 39-A–39-E, 47–50 y 162), capacitación y desempeño (arts. 3, 56, 153-A y 154–159), y prevención de violencia laboral (arts. 3 Bis y 132 XXXI). https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf
2. **Diario Oficial de la Federación (DOF).** *Decreto de reforma sobre reducción gradual de la jornada laboral (2026–2030).* Referencia para el régimen transitorio de máximo semanal (48 h en 2026 hasta 40 h en 2030). https://www.dof.gob.mx/
3. **Cámara de Diputados / Instituto Mexicano del Seguro Social (IMSS).** *Ley del Seguro Social (LSS)* (arts. 58 y 96–98) y orientación operativa sobre subsidios por incapacidad temporal en enfermedad general y riesgo de trabajo. https://www.imss.gob.mx/
4. **Secretaría del Trabajo y Previsión Social (STPS).** *Marco normativo de seguridad y salud en el trabajo:* `NOM-035-STPS-2018` (factores de riesgo psicosocial) y `NOM-037-STPS-2023` (condiciones de seguridad y salud en teletrabajo). https://www.gob.mx/stps
5. **Secretaría del Trabajo y Previsión Social (STPS).** *Modelo de protocolo para prevenir, atender y erradicar la violencia laboral en los centros de trabajo.* Referencia para el canal confidencial de denuncia, medidas de protección y atención de casos en `RH-09`. https://www.gob.mx/stps
6. **Cámara de Diputados del H. Congreso de la Unión.** *Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).* Referencia para finalidades de tratamiento, aviso de privacidad y ejercicio de derechos ARCO en `RH-10`. https://www.diputados.gob.mx/LeyesBiblio/ref/lfpdppp.htm
