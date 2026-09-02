const input = document.getElementById('fileInput');
const drop = document.getElementById('dropZone');
const list = document.getElementById('fileList');
const emptyState = document.getElementById('emptyState');
const fileCount = document.getElementById('fileCount');
const totalSize = document.getElementById('totalSize');
const clearBtn = document.getElementById('clearBtn');
const addMoreBtn = document.getElementById('addMoreBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
const advancedBtn = document.getElementById('advancedBtn');
const advancedCard = document.getElementById('advancedCard');
const qualityRange = document.getElementById('qualityRange');
const qualityLabel = document.getElementById('qualityLabel');
const themeBtn = document.getElementById('themeBtn');
const summary = document.getElementById('summary');

let files = [];

function currentMode(){ return document.querySelector('input[name="mode"]:checked').value; }

document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('[data-mode-card]').forEach(x => x.classList.remove('active'));
    radio.closest('[data-mode-card]').classList.add('active');
    autoConvertAll();
  });
});

input.addEventListener('change', (event) => {
  const picked = Array.from(event.target.files || []);
  if (!picked.length) return;
  addFiles(picked);
});
addMoreBtn.addEventListener('click', () => input.click());
['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragging'); }));
['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));

function getExtension(name){
  const match = String(name || '').trim().toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : '';
}

function isSupportedFile(file){
  // Intentionally validate by filename extension, not MIME type.
  // macOS/Chrome can report TIFF as image/tif, image/tiff, application/octet-stream, or an empty MIME type.
  return ['png','jpg','jpeg','tif','tiff'].includes(getExtension(file && file.name));
}

function showMessage(message){
  summary.textContent = message;
  summary.classList.remove('hidden');
}

function addFiles(incoming){
  try {
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    const picked = Array.from(incoming || []);
    const supported = picked.filter(isSupportedFile);
    const valid = supported.filter(f => Number(f.size || 0) <= MAX_FILE_SIZE);
    const tooLarge = supported.filter(f => Number(f.size || 0) > MAX_FILE_SIZE);
    const unsupported = picked.filter(f => !isSupportedFile(f));

    const messages = [];
    if (tooLarge.length) {
      messages.push(`${tooLarge.length} file${tooLarge.length===1?' was':'s were'} over the 100MB-per-file limit`);
    }
    if (unsupported.length) {
      messages.push(`${unsupported.length} unsupported file${unsupported.length===1?'':'s'} (${unsupported.map(f => f.name).join(', ')})`);
    }

    valid.forEach(file => {
      const exists = files.some(x => x.file.name === file.name && x.file.size === file.size && x.file.lastModified === file.lastModified);
      if (!exists) {
        files.push({
          id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file,
          selected: true,
          converted: null,
          status: 'Ready',
          error: null
        });
      }
    });

    input.value = '';
    render();

    if (messages.length) showMessage(`Skipped: ${messages.join(' and ')}.`);
    else if (valid.length) showMessage(`${valid.length} file${valid.length===1?'':'s'} added. Starting conversion…`);

    // Allow the browser to paint the selected files before decoding large TIFFs.
    requestAnimationFrame(() => setTimeout(() => autoConvertNew(), 0));
  } catch (error) {
    console.error('Unable to add files:', error);
    showMessage(`Unable to add the selected files: ${error && error.message ? error.message : 'Unknown error'}`);
  }
}

function render(){
  list.innerHTML = '';
  if (!files.length) {
    list.appendChild(emptyState);
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    files.forEach(item => list.appendChild(makeRow(item)));
  }
  const total = files.reduce((s,x)=>s+x.file.size,0);
  fileCount.textContent = `${files.length} file${files.length===1?'':'s'} selected`;
  totalSize.textContent = `Total size: ${fmt(total)}`;
  clearBtn.disabled = !files.length;
  downloadAllBtn.disabled = !files.some(x=>x.converted);
  downloadSelectedBtn.disabled = !files.some(x=>x.converted && x.selected);
}

function makeRow(item){
  const row = document.createElement('div'); row.className='file-row';
  const isTiff = ['tif','tiff'].includes(getExtension(item.file.name));
  const previewSource = isTiff && !item.converted ? null : (isTiff ? item.converted.blob : item.file);
  const tiffPlaceholder = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 58 58"><rect width="58" height="58" rx="8" fill="%23171a23"/><text x="29" y="34" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="%23b58cff">TIFF</text></svg>`);
  const url = previewSource ? URL.createObjectURL(previewSource) : tiffPlaceholder;
  const convertedSize = item.converted?.blob.size;
  row.innerHTML = `
    <div class="file-main">
      <input class="select-box" type="checkbox" ${item.selected?'checked':''} aria-label="Select ${escapeHtml(item.file.name)}">
      <img class="thumb ${isTiff && !item.converted ? 'tiff-pending' : ''}" alt="" src="${url}">
      <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
    </div>
    <div class="metric original">${fmt(item.file.size)}</div>
    <div class="metric converted-metric">${convertedSize ? fmt(convertedSize) : '—'}</div>
    <div class="savings">${convertedSize ? savings(item.file.size, convertedSize) : '—'}</div>
    <div class="status-wrap"><span class="status-pill ${item.status==='Ready'?'pending':item.status==='Error'?'error':''}">${item.status}</span></div>
    <div class="row-actions">
      <button class="mini-btn preview-btn" title="Preview">◉</button>
      <button class="mini-btn download-btn" title="Download" ${item.converted?'':'disabled'}>⇩</button>
      <button class="mini-btn danger remove-btn" title="Remove">⌫</button>
    </div>`;
  if (previewSource) row.querySelector('.thumb').addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
  row.querySelector('.select-box').addEventListener('change',e=>{item.selected=e.target.checked;render();});
  row.querySelector('.remove-btn').addEventListener('click',()=>{files=files.filter(x=>x.id!==item.id);render();});
  row.querySelector('.download-btn').addEventListener('click',()=>item.converted&&download(item.converted.blob,item.converted.name));
  row.querySelector('.preview-btn').addEventListener('click',()=>window.open(URL.createObjectURL(item.converted?.blob || item.file),'_blank'));
  return row;
}


async function convertItem(item){
  item.status='Converting'; render();
  try{ item.converted=await toWebP(item.file,currentMode()); item.status='Done'; }
  catch(e){ console.error(e); item.status='Error'; item.error = e && e.message ? e.message : 'Conversion failed'; showMessage(`${item.file.name}: ${item.error}`); }
  render();
}

async function autoConvertNew(){
  const pending=files.filter(x=>!x.converted && x.status!=='Converting');
  for(const item of pending) await convertItem(item);
  updateSummary();
}

async function autoConvertAll(){
  for(const item of files){ item.converted=null; item.status='Ready'; }
  render();
  for(const item of files) await convertItem(item);
  updateSummary();
}

function updateSummary(){
  if(!files.length){ summary.classList.add('hidden'); return; }
  const done=files.filter(x=>x.converted);
  if(!done.length) return;
  const original=done.reduce((s,x)=>s+x.file.size,0);
  const converted=done.reduce((s,x)=>s+x.converted.blob.size,0);
  summary.textContent=`${done.length} image${done.length===1?'':'s'} converted. ${fmt(original)} → ${fmt(converted)} (${savings(original,converted)}).`;
}

async function toWebP(file, mode){
  if (['tif','tiff'].includes(getExtension(file.name))) return tiffToWebP(file, mode);
  return browserImageToWebP(file, mode);
}

function browserImageToWebP(file, mode){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d',{alpha:true});
      ctx.drawImage(img,0,0);
      canvasToWebP(canvas, mode)
        .then(blob => resolve({name:webPName(file.name),blob}))
        .catch(reject)
        .finally(() => URL.revokeObjectURL(url));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Unable to read image'));};
    img.src=url;
  });
}

async function tiffToWebP(file, mode){
  if (typeof UTIF === 'undefined') {
    throw new Error('TIFF decoder failed to load. Check your internet connection and reload the page.');
  }

  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds || !ifds.length) throw new Error('No image was found in this TIFF file.');

  // Convert the first page/frame. Multi-page TIFFs are intentionally handled as first-page only.
  const page = ifds[0];
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);

  const width = page.width || page.t256?.[0];
  const height = page.height || page.t257?.[0];
  if (!width || !height) throw new Error('Unable to determine TIFF dimensions.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha:true });
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);

  const blob = await canvasToWebP(canvas, mode);
  return { name:webPName(file.name), blob, multiPage:ifds.length > 1 };
}

function canvasToWebP(canvas, mode){
  const q = mode === 'optimized' ? Number(qualityRange.value)/100 : 1;
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>{
      if(!blob) return reject(new Error('WebP conversion failed'));
      resolve(blob);
    },'image/webp',q);
  });
}

function webPName(name){
  return name.replace(/\.(png|jpe?g|tiff?)$/i,'') + '.webp';
}

downloadAllBtn.addEventListener('click',()=>downloadMany(files.filter(x=>x.converted)));
downloadSelectedBtn.addEventListener('click',()=>downloadMany(files.filter(x=>x.converted&&x.selected)));
async function downloadMany(items){ for(const item of items){ download(item.converted.blob,item.converted.name); await new Promise(r=>setTimeout(r,180)); } }
function download(blob,name){ const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200); }

clearBtn.addEventListener('click',()=>{files=[];summary.classList.add('hidden');render();});
advancedBtn.addEventListener('click',()=>advancedCard.classList.toggle('hidden'));
qualityRange.addEventListener('input',()=>qualityLabel.textContent=qualityRange.value+'%');
qualityRange.addEventListener('change',()=>{if(currentMode()==='optimized')autoConvertAll();});
themeBtn.addEventListener('click',()=>document.body.classList.toggle('no-glow'));
document.getElementById('settingsBtn').addEventListener('click',()=>advancedCard.classList.toggle('hidden'));

function fmt(n){ if(!n)return '0 B'; const u=['B','KB','MB','GB']; const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),u.length-1); return `${(n/1024**i).toFixed(i?2:0)} ${u[i]}`; }
function savings(a,b){ if(!a)return '0%'; const d=(a-b)/a*100; return `${d>=0?'−':'+'}${Math.abs(d).toFixed(1)}%`; }
function escapeHtml(v){ return v.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
render();
