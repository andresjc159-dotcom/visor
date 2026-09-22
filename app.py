import os
import time
import json
import tempfile
import shutil
import zipfile
import uuid
import numpy as np
import traceback
import urllib.parse
import hashlib
from flask import Flask, render_template, request, Response
from flask_cors import CORS
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from google import genai
from PIL import Image

try:
    import pydicom
except ImportError:
    pydicom = None

app = Flask(__name__)
CORS(app)

# Asegúrate de que esta ruta coincida con el alias de Nginx si generas imágenes nuevas
DICOM_STORAGE = os.path.join("static", "dicom_storage")
os.makedirs(DICOM_STORAGE, exist_ok=True)

# URL base del visor PACS externo. Si el usuario escribe solo el Study UID, se antepone esta base.
PACS_BASE_URL = os.environ.get("PACS_BASE_URL", "https://teleradiologia.imexhs.com/viewer/view?studyUID=")

def normalizar_url(entrada):
    """Acepta una URL completa o un Study UID y devuelve la URL final del visor PACS."""
    if not entrada:
        return entrada
    entrada = entrada.strip()
    if entrada.startswith("http://") or entrada.startswith("https://"):
        return entrada
    return PACS_BASE_URL + entrada

# CONVERSIÓN IMAGEN
def dicom_to_image(dicom_path):
    if not pydicom: return None
    try:
        ds = pydicom.dcmread(dicom_path, force=True)
        if not hasattr(ds, 'PixelData'): return None
        data = ds.pixel_array.astype(float)
        slope = getattr(ds, 'RescaleSlope', 1)
        intercept = getattr(ds, 'RescaleIntercept', 0)
        data = (data * slope) + intercept
        _min, _max = np.min(data), np.max(data)
        if _max - _min != 0:
            data = (data - _min) / (_max - _min) * 255.0
        img = Image.fromarray(data.astype('uint8')).convert('L')
        img.thumbnail((512, 512)) 
        return img
    except: return None

# IDENTIFICADOR ÚNICO DE ESTUDIO
def obtener_id_estudio(url):
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        if 'studyUID' in qs: return qs['studyUID'][0]
    except: pass
    return hashlib.md5(url.encode()).hexdigest()

# ESTADO DE VALIDACIÓN DE LA API KEY DE GEMINI (con caché)
GEMINI_STATE = {"valid": None, "detail": None, "checked_at": 0}
GEMINI_CACHE_TTL = 300

def comprobar_gemini(force=False):
    """Valida la API key de Gemini con una llamada mínima y cachea el resultado."""
    ahora = time.time()
    if not force and GEMINI_STATE["checked_at"] and (ahora - GEMINI_STATE["checked_at"]) < GEMINI_CACHE_TTL:
        return GEMINI_STATE["valid"], GEMINI_STATE["detail"]
    try:
        client = genai.Client()
        client.models.generate_content(model="gemini-2.5-flash", contents="responde: ok")
        GEMINI_STATE["valid"] = True
        GEMINI_STATE["detail"] = None
    except Exception as e:
        GEMINI_STATE["valid"] = False
        GEMINI_STATE["detail"] = str(e)
    GEMINI_STATE["checked_at"] = ahora
    return GEMINI_STATE["valid"], GEMINI_STATE["detail"]

# CAPTURA (GENERADOR CON CACHÉ)
def capturar_y_procesar(url):
    session_id = obtener_id_estudio(url)
    session_path = os.path.join(DICOM_STORAGE, session_id)
    metadata_path = os.path.join(session_path, "metadata.json")

    # --- VERIFICACIÓN DE CACHÉ ---
    if os.path.exists(metadata_path):
        yield {"progress": 30, "message": "Estudio encontrado en caché del servidor..."}
        time.sleep(0.5)
        try:
            with open(metadata_path, 'r') as f:
                datos_cacheados = json.load(f)
            yield {"progress": 80, "message": "Imágenes recuperadas. Preparando IA...", 
                   "series": datos_cacheados["series"], 
                   "patient": datos_cacheados["patient"],
                   "study": datos_cacheados.get("study", {})}
            return
        except: pass 
    
    # --- DESCARGA NORMAL CON SELENIUM ---
    temp_dir = tempfile.mkdtemp()
    os.makedirs(session_path, exist_ok=True)
    
    yield {"progress": 10, "message": "Iniciando entorno seguro oculto..."}
    
    chrome_options = Options()
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-features=NetworkService")
    
    prefs = {"download.default_directory": temp_dir, "download.prompt_for_download": False, "safebrowsing.enabled": False}
    chrome_options.add_experimental_option("prefs", prefs)
    
    driver = None
    series_data = {} 
    datos_paciente = {"nombre": "PACIENTE", "id": "---", "sexo": "", "edad": "", "nacimiento": ""}
    datos_estudio = {"descripcion": "", "fecha": "", "hora": "", "accesion": "", "modalidad": ""}
    
    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        
        driver.execute_cdp_cmd("Page.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": temp_dir
        })
        
        yield {"progress": 20, "message": "Conectando al servidor PACS..."}
        driver.get(url)
        wait = WebDriverWait(driver, 60)
        original_window = driver.current_window_handle
        
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "canvas")))
        time.sleep(3)
        
        yield {"progress": 30, "message": "Preparando paquete DICOM..."}
        try:
            driver.find_element(By.ID, "tb-more").click(); time.sleep(1)
            driver.find_element(By.ID, "tb-download-dicom-link").click()
        except: driver.execute_script("document.getElementById('tb-download-dicom-link').click();")

        for _ in range(10): 
            if len(driver.window_handles) > 1: break
            time.sleep(1)
        for w in driver.window_handles: 
            if w != original_window: driver.switch_to.window(w); break
        try: wait.until(EC.element_to_be_clickable((By.ID, "download_button"))).click()
        except: pass

        yield {"progress": 45, "message": "Descargando estudio (esto puede tardar unos segundos)..."}
        zip_path = None
        for _ in range(90):
            time.sleep(1)
            files = os.listdir(temp_dir)
            zips = [f for f in files if f.endswith('.zip')]
            if zips and not any(f.endswith('.crdownload') for f in files):
                zip_path = os.path.join(temp_dir, zips[0])
                break
        
        if zip_path:
            yield {"progress": 60, "message": "Descomprimiendo archivos médicos..."}
            time.sleep(2)
            with zipfile.ZipFile(zip_path, 'r') as z: z.extractall(session_path)
            
            all_files = []
            for root, _, fnames in os.walk(session_path):
                for f in fnames: all_files.append(os.path.join(root, f))
            all_files.sort()
            
            yield {"progress": 70, "message": "Estructurando y limpiando series DICOM..."}
            for i, f_path in enumerate(all_files):
                try:
                    ds = pydicom.dcmread(f_path, stop_before_pixels=True, force=True)
                    
                    if datos_paciente["nombre"] == "PACIENTE":
                        try:
                            datos_paciente["nombre"] = str(ds.PatientName).replace('^', ' ').strip().upper()
                            datos_paciente["id"] = str(ds.PatientID)
                            if 'PatientAge' in ds: datos_paciente["edad"] = str(ds.PatientAge)
                            if 'PatientSex' in ds: datos_paciente["sexo"] = str(ds.PatientSex)
                            if 'PatientBirthDate' in ds and ds.PatientBirthDate: datos_paciente["nacimiento"] = str(ds.PatientBirthDate)
                            if 'StudyDescription' in ds and ds.StudyDescription: datos_estudio["descripcion"] = str(ds.StudyDescription)
                            if 'StudyDate' in ds and ds.StudyDate: datos_estudio["fecha"] = str(ds.StudyDate)
                            if 'StudyTime' in ds and ds.StudyTime: datos_estudio["hora"] = str(ds.StudyTime)
                            if 'AccessionNumber' in ds and ds.AccessionNumber: datos_estudio["accesion"] = str(ds.AccessionNumber)
                        except: pass
                    if not datos_estudio["modalidad"] and 'Modality' in ds and ds.Modality:
                        datos_estudio["modalidad"] = str(ds.Modality)

                    desc = str(ds.SeriesDescription).upper() if 'SeriesDescription' in ds else ""
                    if any(x in desc for x in ["DOSE", "PROTOCOL", "SCREEN", "REPORT", "SCIT", "SUMMARY"]):
                        continue 
                    
                    if 'ImageType' in ds and 'SECONDARY' in ds.ImageType and len(all_files) > 10:
                         pass

                    series_uid = ds.SeriesInstanceUID
                    if series_uid not in series_data:
                        s_num = int(ds.SeriesNumber) if 'SeriesNumber' in ds and str(ds.SeriesNumber).isdigit() else 999
                        
                        series_data[series_uid] = {
                            "description": str(ds.SeriesDescription) if 'SeriesDescription' in ds else f"Serie {len(series_data)+1}",
                            "seriesNumber": s_num,
                            "modality": str(ds.Modality) if 'Modality' in ds else "",
                            "sliceThickness": float(ds.SliceThickness) if 'SliceThickness' in ds and ds.SliceThickness else None,
                            "pixelSpacing": [float(x) for x in ds.PixelSpacing] if 'PixelSpacing' in ds else None,
                            "rows": int(ds.Rows) if 'Rows' in ds else None,
                            "columns": int(ds.Columns) if 'Columns' in ds else None,
                            "files": []
                        }
                    
                    new_name = f"{series_uid}_{i:04d}.dcm"
                    new_path = os.path.join(os.path.dirname(f_path), new_name)
                    os.rename(f_path, new_path)
                    
                    rel_url = os.path.relpath(new_path, "static").replace("\\", "/")
                    series_data[series_uid]["files"].append(f"/static/{rel_url}")
                    
                except: continue

            series_data = {k: v for k, v in series_data.items() if len(v["files"]) > 0}

    except Exception as e:
        traceback.print_exc()
        yield {"error": f"Error en captura: {str(e)}"}
    finally:
        if driver: driver.quit()
        try: shutil.rmtree(temp_dir)
        except: pass
        
    try:
        with open(metadata_path, 'w') as f:
            json.dump({"series": series_data, "patient": datos_paciente, "study": datos_estudio}, f)
    except: pass

    yield {"progress": 80, "message": "Preparando imágenes para inteligencia artificial...", "series": series_data, "patient": datos_paciente, "study": datos_estudio}

@app.route('/analyze', methods=['POST'])
def analyze():
    url = normalizar_url(request.json.get('url'))
    
    def generate():
        try:
            series_data = None
            patient_data = None
            study_data = {}
            
            for step in capturar_y_procesar(url):
                if "error" in step:
                    yield json.dumps({"error": step["error"]}) + "\n"
                    return
                if "series" in step:
                    series_data = step["series"]
                    patient_data = step["patient"]
                    study_data = step.get("study", {})
                
                yield json.dumps({"progress": step["progress"], "message": step["message"]}) + "\n"

            if not series_data:
                yield json.dumps({"error": "No se encontraron imágenes DICOM válidas."}) + "\n"
                return

            yield json.dumps({"progress": 85, "message": "Preparando análisis con IA..."}) + "\n"

            main_uid = max(series_data, key=lambda k: len(series_data[k]["files"]))
            main_files = series_data[main_uid]["files"]
            sample_indices = np.linspace(0, len(main_files)-1, 6, dtype=int)

            edad_paciente = patient_data.get('edad', 'No especificada')
            sexo_paciente = patient_data.get('sexo', 'No especificado')

            # PROMPT ANONIMIZADO POR SEGURIDAD
            prompt_text = f"""Actúa como un médico radiólogo experto.
Analiza detalladamente esta serie de imágenes médicas correspondientes a un paciente.

**Datos Clínicos:**
- Edad: {edad_paciente}
- Sexo: {sexo_paciente}

Genera un reporte radiológico estructurado en formato Markdown con las siguientes secciones exactas:

1. **Técnica:** (Indica brevemente el tipo de estudio que infieres de las imágenes, ej. Tomografía, Radiografía, etc.)
2. **Hallazgos:** (Descripción clínica y detallada de anomalías, lesiones, o normalidad anatómica).
3. **Impresión Diagnóstica:** (Conclusión principal y directa del estudio).
4. **Codificación CIE-10:** (Sugiere 1 o 2 códigos CIE-10 exactos que correspondan a la impresión diagnóstica. Formato: `[Código] - [Descripción]`).
5. **Recomendaciones:** (Sugerencias clínicas, de seguimiento o correlación, si aplica).

**Reglas estrictas:**
- Mantén un tono estrictamente profesional y objetivo.
- Si las imágenes tienen muy baja resolución o no muestran hallazgos concluyentes, indícalo explícitamente en la impresión diagnóstica y no inventes diagnósticos.
"""
            report = None
            ai_error = None

            # Validar la API key ANTES de intentar generar el reporte con IA
            gemini_ok, gemini_detail = comprobar_gemini()

            if not gemini_ok:
                ai_error = "No hay una clave de API de Gemini válida. El reporte con IA no está disponible, pero puedes visualizar las imágenes."
            else:
                gemini_payload = [prompt_text]

                count = 0
                for idx in sample_indices:
                    web_path = main_files[idx]
                    sys_path = os.path.join(app.root_path, web_path.lstrip('/').replace('/', os.sep))
                    img = dicom_to_image(sys_path)
                    if img:
                        gemini_payload.append(img)
                        count += 1

                yield json.dumps({"progress": 95, "message": "Estructurando diagnóstico CIE-10..."}) + "\n"

                if count == 0:
                    ai_error = "Las imágenes no se pudieron convertir a un formato legible para la IA."
                else:
                    client = genai.Client()
                    max_intentos = 3
                    for intento in range(max_intentos):
                        try:
                            response = client.models.generate_content(
                                model='gemini-2.5-flash',
                                contents=gemini_payload
                            )
                            report = response.text
                            break
                        except Exception as e:
                            if '503' in str(e) and intento < max_intentos - 1:
                                time.sleep(2 ** (intento + 1))
                                continue
                            ai_error = f"No se pudo generar el reporte con IA: {str(e)[:200]}"
                            break

            yield json.dumps({
                "progress": 100,
                "message": "Completado.",
                "series": series_data,
                "patient": patient_data,
                "study": study_data,
                "report": report,
                "ai_error": ai_error
            }) + "\n"
            
        except Exception as e: 
            yield json.dumps({"error": f"Error IA: {str(e)}"}) + "\n"

    # CABECERAS MÁGICAS PARA NGINX
    return Response(
        generate(), 
        mimetype='application/x-ndjson',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no'
        }
    )

@app.route('/')
def home(): return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)