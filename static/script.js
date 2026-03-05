// --- 1. CONFIGURACIÓN E INICIALIZACIÓN ---
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.init({
    showSVGCursors: true
});

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const element = document.getElementById('dicomImage');
cornerstone.enable(element);

const resizeObserver = new ResizeObserver(() => {
    try { cornerstone.resize(element); } catch(e){}
});
resizeObserver.observe(document.querySelector('.viewer'));

let seriesData = {};

// --- 2. AUTOINICIO ---
window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    
    if(params.get('target')) {
        const url = decodeURIComponent(params.get('target'));
        document.getElementById('urlInput').value = url;
        mostrarCarga("Iniciando...");
        iniciarCarga();
    } else {
        document.getElementById('startupModal').style.display = 'flex';
    }
};

function iniciarCargaManual() {
    document.getElementById('startupModal').style.display = 'none';
    mostrarCarga("Solicitando estudio...");
    iniciarCarga();
}

// --- 3. LÓGICA PRINCIPAL DE CARGA (STREAMING) ---
async function iniciarCarga() {
    const url = document.getElementById('urlInput').value;
    if(!url) return;

    try {
        actualizarProgreso(5, "Conectando al servidor...");

        const res = await fetch('/analyze', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({url: url})
        });

        // Leer el stream de datos
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let finalData = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, {stream: true});
            const lines = chunk.split('\n');
            
            for (let line of lines) {
                if (line.trim() !== '') {
                    const data = JSON.parse(line);
                    
                    if (data.error) throw new Error(data.error);
                    
                    if (data.progress) {
                        actualizarProgreso(data.progress, data.message);
                    }
                    
                    if (data.report && data.series) {
                        finalData = data; // Guardar datos finales cuando lleguen
                    }
                }
            }
        }

        if(!finalData) throw new Error("No se recibió información completa del servidor.");

        // --- PROCESAR DATOS FINALES ---
        document.getElementById('pName').innerText = finalData.patient.nombre || "---";
        document.getElementById('pId').innerText = finalData.patient.id || "---";
        document.getElementById('pAge').innerText = finalData.patient.edad || "--";
        document.getElementById('pSex').innerText = finalData.patient.sexo || "--";
        
        document.getElementById('aiContent').innerHTML = formatMarkdown(finalData.report);
        if(finalData.report && finalData.report.length > 50) {
            document.getElementById('reportDrawer').classList.add('open');
        }

        actualizarProgreso(100, "Generando miniaturas visuales...");

        seriesData = finalData.series;
        const sidebar = document.getElementById('seriesList');
        sidebar.innerHTML = "";
        
        const sortedUids = Object.keys(seriesData).sort((a,b) => {
            const numA = seriesData[a].seriesNumber || 999;
            const numB = seriesData[b].seriesNumber || 999;
            return numA - numB;
        });

        let firstUid = null;

        sortedUids.forEach((uid, index) => {
            if(!firstUid) firstUid = uid;
            const info = seriesData[uid];
            
            const item = document.createElement('div');
            item.className = 'serie-item';
            item.onclick = () => loadSeries(uid, item);
            
            const canvasDiv = document.createElement('div');
            canvasDiv.className = 'serie-canvas';
            canvasDiv.id = `thumb-${uid}`;
            
            const desc = info.description.length > 18 ? info.description.substring(0,15)+"..." : info.description;
            item.innerHTML = `
                <div class="serie-label">
                    <span>${desc}</span><br>${info.files.length} img
                </div>
            `;
            item.prepend(canvasDiv);
            sidebar.appendChild(item);

            setTimeout(() => {
                try {
                    cornerstone.enable(canvasDiv);
                    const midIdx = Math.floor(info.files.length / 2);
                    const thumbUrl = `wadouri:${info.files[midIdx]}`;

                    cornerstone.loadImage(thumbUrl).then(image => {
                        cornerstone.displayImage(canvasDiv, image);
                        cornerstone.reset(canvasDiv); 
                    }).catch(e => console.log("Error thumb", e));
                } catch(e) {}
            }, 50 + (index * 60)); 
        });

        setTimeout(() => ocultarCarga(), 800);
        
        if(firstUid) {
            setTimeout(() => loadSeries(firstUid, sidebar.firstChild), 100);
        }

    } catch (e) {
        console.error(e);
        actualizarProgreso(100, "Error crítico.");
        setTimeout(() => { ocultarCarga(); alert(e.message); }, 2000);
    }
}

// --- 4. CARGA DE SERIE EN VISOR PRINCIPAL ---
function loadSeries(uid, elementRef) {
    document.querySelectorAll('.serie-item').forEach(el => el.classList.remove('active'));
    if(elementRef) elementRef.classList.add('active');

    const files = seriesData[uid].files;
    const imageIds = files.map(f => `wadouri:${f}`);
    
    const startIdx = Math.floor(imageIds.length / 2);

    const stack = {
        currentImageIdIndex: startIdx,
        imageIds: imageIds
    };

    cornerstone.loadImage(imageIds[startIdx]).then(image => {
        cornerstone.displayImage(element, image);
        
        // Herramientas
        const StackScroll = cornerstoneTools.StackScrollMouseWheelTool;
        const Wwwc = cornerstoneTools.WwwcTool; 
        const Zoom = cornerstoneTools.ZoomTool;
        const Pan = cornerstoneTools.PanTool;
        const Length = cornerstoneTools.LengthTool;
        const Angle = cornerstoneTools.AngleTool;
        const Probe = cornerstoneTools.ProbeTool;
        const Eraser = cornerstoneTools.EraserTool;
        
        cornerstoneTools.addTool(StackScroll);
        cornerstoneTools.addTool(Wwwc);
        cornerstoneTools.addTool(Zoom);
        cornerstoneTools.addTool(Pan);
        cornerstoneTools.addTool(Length);
        cornerstoneTools.addTool(Angle);
        cornerstoneTools.addTool(Probe);
        cornerstoneTools.addTool(Eraser);

        cornerstoneTools.addStackStateManager(element, ['stack']);
        cornerstoneTools.addToolState(element, 'stack', stack);

        activarHerramienta('Wwwc', document.getElementById('btn_Wwwc'));
        cornerstoneTools.setToolActive('StackScrollMouseWheel', { });
        
        updateOverlay(startIdx, imageIds.length);
        
        element.removeEventListener('cornerstonenewimage', onNewImage);
        element.addEventListener('cornerstonenewimage', onNewImage);
        
        cornerstone.reset(element);
    });
}

function onNewImage(e) {
    const stackData = cornerstoneTools.getToolState(element, 'stack');
    if (stackData && stackData.data[0]) {
        updateOverlay(stackData.data[0].currentImageIdIndex, stackData.data[0].imageIds.length);
    }
}

function updateOverlay(idx, total) {
    document.getElementById('overlaySlice').innerText = `Img: ${idx + 1} / ${total}`;
}

// --- 5. FUNCIONES DE INTERFAZ Y BOTONES ---

function activarHerramienta(toolName, btn) {
    ['Wwwc', 'Zoom', 'Pan', 'Length', 'Angle', 'Probe', 'Eraser'].forEach(t => cornerstoneTools.setToolPassive(t));
    
    cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
    
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
}

function accion(tipo) {
    const vp = cornerstone.getViewport(element);
    if(tipo === 'invert') vp.invert = !vp.invert;
    if(tipo === 'reset') cornerstone.reset(element);
    cornerstone.setViewport(element, vp);
}

function toggleReport() {
    const drawer = document.getElementById('reportDrawer');
    drawer.classList.toggle('open');
}

function formatMarkdown(text) {
    if(!text) return "Sin análisis.";
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>')
        .replace(/- /g, '• ');
}

// --- 6. GESTIÓN DE PANTALLA DE CARGA Y PROGRESO ---

function mostrarCarga(msg) {
    const overlay = document.getElementById('loadingOverlay');
    if(overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
        actualizarProgreso(0, msg);
    }
}

function actualizarProgreso(porcentaje, msg) {
    const txt = document.getElementById('loadingText');
    const bar = document.getElementById('progressBar');
    if(txt) txt.innerText = msg;
    if(bar) bar.style.width = porcentaje + "%";
}

function ocultarCarga() {
    const overlay = document.getElementById('loadingOverlay');
    if(overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}