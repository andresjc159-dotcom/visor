import os
import time
import json
import tempfile
import shutil
import zipfile
import uuid
import threading
import numpy as np
import traceback
from flask import Flask, render_template, request, Response
from flask_cors import CORS
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import google.generativeai as genai
from PIL import Image

try:
    import pydicom
except ImportError:
    pydicom = None

app = Flask(__name__)
CORS(app)

DICOM_STORAGE = os.path.join("static", "dicom_storage")
if os.path.exists(DICOM_STORAGE): shutil.rmtree(DICOM_STORAGE)
os.makedirs(DICOM_STORAGE, exist_ok=True)

# TAREA DE LIMPIEZA
def tarea_limpieza():
    while True:
        time.sleep(3600)
        try:
            for filename in os.listdir(DICOM_STORAGE):
                file_path = os.path.join(DICOM_STORAGE, filename)
                if os.path.isdir(file_path): shutil.rmtree(file_path)
                else: os.unlink(file_path)
        except: pass

hilo = threading.Thread(target=tarea_limpieza, daemon=True)
hilo.start()

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

# CAPTURA (AHORA ES UN GENERADOR)
def capturar_y_procesar(url):
    temp_dir = tempfile.mkdtemp()
    session_id = str(uuid.uuid4())
    session_path = os.path.join(DICOM_STORAGE, session_id)
    os.makedirs(session_path, exist_ok=True)
    
    yield {"progress": 10, "message": "Iniciando entorno seguro oculto..."}
    
    chrome_options = Options()
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--disable-gpu")
    
    prefs = {"download.default_directory": temp_dir, "download.prompt_for_download": False, "safebrowsing.enabled": False}
    chrome_options.add_experimental_option("prefs", prefs)
    
    driver = None
    series_data = {} 
    datos_paciente = {"nombre": "PACIENTE", "id": "---", "sexo": "", "edad": ""}
    
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
                        except: pass

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
        yield {"error": f"Error en captura: {str(e)}"}
    finally:
        if driver: driver.quit()
        try: shutil.rmtree(temp_dir)
        except: pass
        
    yield {"progress": 80, "message": "Preparando imágenes para inteligencia artificial...", "series": series_data, "patient": datos_paciente}

# RUTA CON RESPUESTA EN STREAM PARA FRONTEND
@app.route('/analyze', methods=['POST'])
def analyze():
    url = request.json.get('url')
    
    def generate():
        try:
            series_data = None
            patient_data = None
            
            # Recibir flujo de descargas
            for step in capturar_y_procesar(url):
                if "error" in step:
                    yield json.dumps({"error": step["error"]}) + "\n"
                    return
                if "series" in step:
                    series_data = step["series"]
                    patient_data = step["patient"]
                
                yield json.dumps({"progress": step["progress"], "message": step["message"]}) + "\n"

            if not series_data:
                yield json.dumps({"error": "No se encontraron imágenes DICOM válidas."}) + "\n"
                return

            yield json.dumps({"progress": 85, "message": "Enviando estudio a Gemini 2.5..."}) + "\n"

            main_uid = max(series_data, key=lambda k: len(series_data[k]["files"]))
            main_files = series_data[main_uid]["files"]
            sample_indices = np.linspace(0, len(main_files)-1, 6, dtype=int)
            
            edad_paciente = patient_data.get('edad', 'No especificada')
            sexo_paciente = patient_data.get('sexo', 'No especificado')

            prompt_text = f"""Actúa como un médico radiólogo experto.
Analiza detalladamente esta serie de imágenes médicas correspondientes a un paciente.

**Datos del Paciente:**
- Nombre: {patient_data['nombre']}
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
            
            if count > 0:
                model = genai.GenerativeModel('models/gemini-2.5-flash')
                response = model.generate_content(gemini_payload)
                report = response.text
            else: 
                report = "Error: Imágenes no legibles por la IA."

            # Paquete final con toda la información
            yield json.dumps({
                "progress": 100, 
                "message": "Completado.", 
                "series": series_data, 
                "patient": patient_data, 
                "report": report
            }) + "\n"
            
        except Exception as e: 
            yield json.dumps({"error": f"Error IA: {str(e)}"}) + "\n"

    return Response(generate(), mimetype='application/x-ndjson')

@app.route('/')
def home(): return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)