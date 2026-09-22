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

// --- 3. LÓGICA PRINCIPAL DE CARGA (STREAMING CORREGIDO) ---
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
        
        let buffer = ''; // Búfer para acumular los pedazos cortados
        let finalData = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            // 1. Añadimos el nuevo pedazo al búfer acumulado
            buffer += decoder.decode(value, { stream: true });
            
            // 2. Separamos por saltos de línea
            const lines = buffer.split('\n');
            
            // 3. Extraemos la última línea (que probablemente esté incompleta) 
            // y la dejamos en el búfer para el siguiente ciclo del while
            buffer = lines.pop(); 
            
            // 4. Procesamos solo las líneas que estamos seguros que están completas
            for (let line of lines) {
                if (line.trim() !== '') {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.error) throw new Error(data.error);
                        
                        if (data.progress) {
                            actualizarProgreso(data.progress, data.message);
                        }
                        
                        if (data.series) {
                            finalData = data; // Guardar datos finales cuando lleguen
                        }
                    } catch (parseError) {
                        // Si el error es del servidor, lo lanzamos. Si es de parseo, lo ignoramos y seguimos.
                        if (parseError.message === JSON.parse(line).error) throw parseError;
                        console.warn("Fragmento JSON saltado:", parseError);
                    }
                }
            }
        }

        // --- EL BLINDAJE FINAL ---
        // Si quedó algo en el búfer al terminar la conexión, procésalo.
        if (buffer.trim() !== '') {
            try {
                const data = JSON.parse(buffer);
                if (data.error) throw new Error(data.error);
                if (data.series) {
                    finalData = data;
                }
            } catch (e) {
                console.error("Error en el último fragmento:", e);
            }
        }

        if(!finalData) throw new Error("No se recibió información completa del servidor.");

        // --- PROCESAR DATOS FINALES ---
        document.getElementById('pName').innerText = finalData.patient.nombre || "---";
        document.getElementById('pId').innerText = finalData.patient.id || "---";
        document.getElementById('pAge').innerText = finalData.patient.edad || "--";
        document.getElementById('pSex').innerText = finalData.patient.sexo || "--";

        renderReport(finalData.report, finalData.ai_error);

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
        actualizarProgreso(100, "No se pudo cargar el estudio.");
        setTimeout(() => {
            ocultarCarga();
            toast(e.message || "No se pudo cargar el estudio.", 'error');
            document.getElementById('startupModal').style.display = 'flex';
        }, 600);
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

function abrirModal() {
    document.getElementById('startupModal').style.display = 'flex';
    document.getElementById('urlInput').focus();
}

function escapeHtml(s) {
    if(!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatMarkdown(text) {
    if(!text) return "";
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

function renderReport(report, aiError) {
    const content = document.getElementById('aiContent');
    if(report && report.trim()) {
        content.innerHTML = formatMarkdown(report);
        if(report.length > 50) {
            document.getElementById('reportDrawer').classList.add('open');
        }
    } else {
        const motivo = aiError || "Análisis con IA no disponible.";
        content.innerHTML = '<div class="ai-empty"><i class="material-icons">info_outline</i><p>' + escapeHtml(motivo) + '</p></div>';
        if(aiError) toast(motivo, 'warning');
    }
}

function toast(msg, tipo) {
    tipo = tipo || 'info';
    const cont = document.getElementById('toastContainer');
    if(!cont || !msg) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + tipo;
    const icon = tipo === 'error' ? 'error' : (tipo === 'warning' ? 'warning' : 'info');
    t.innerHTML = '<i class="material-icons">' + icon + '</i><span>' + escapeHtml(msg) + '</span>';
    cont.appendChild(t);
    setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 400); }, 6000);
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

// --- 7. ATAJOS DE TECLADO ---
document.addEventListener('keydown', (e) => {
    if(document.getElementById('startupModal').style.display === 'flex') return;

    if(e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const stackData = cornerstoneTools.getToolState(element, 'stack');
        if(!stackData || !stackData.data || !stackData.data[0]) return;
        const stack = stackData.data[0];
        const total = stack.imageIds.length;
        let idx = stack.currentImageIdIndex;
        if(e.key === 'ArrowRight') idx = Math.min(total - 1, idx + 1);
        else idx = Math.max(0, idx - 1);
        stack.currentImageIdIndex = idx;
        cornerstone.loadImage(stack.imageIds[idx]).then(img => {
            cornerstone.displayImage(element, img);
            updateOverlay(idx, total);
        });
        e.preventDefault();
    } else if(e.key === 'r' || e.key === 'R') {
        cornerstone.reset(element);
    } else if(e.key === 'i' || e.key === 'I') {
        accion('invert');
    }
});