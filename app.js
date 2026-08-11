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

input.addEventListener('change', () => addFiles([...input.files]));
addMoreBtn.addEventListener('click', () => input.click());
['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragging'); }));
['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));

function addFiles(incoming){
  const valid = incoming.filter(f => /\.(png|jpe?g)$/i.test(f.name) && f.size <= 50 * 1024 * 1024);
  valid.forEach(file => {
    const exists = files.some(x => x.file.name === file.name && x.file.size === file.size && x.file.lastModified === file.lastModified);
    if (!exists) files.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()), file, selected:true, converted:null, status:'Ready' });
  });
  input.value = '';
  render();
  autoConvertNew();
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
  const url = URL.createObjectURL(item.file);
  const convertedSize = item.converted?.blob.size;
  row.innerHTML = `
    <div class="file-main">
      <input class="select-box" type="checkbox" ${item.selected?'checked':''} aria-label="Select ${escapeHtml(item.file.name)}">
      <img class="thumb" alt="" src="${url}">
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
  row.querySelector('.thumb').addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
  row.querySelector('.select-box').addEventListener('change',e=>{item.selected=e.target.checked;render();});
  row.querySelector('.remove-btn').addEventListener('click',()=>{files=files.filter(x=>x.id!==item.id);render();});
  row.querySelector('.download-btn').addEventListener('click',()=>item.converted&&download(item.converted.blob,item.converted.name));
  row.querySelector('.preview-btn').addEventListener('click',()=>window.open(URL.createObjectURL(item.converted?.blob || item.file),'_blank'));
  return row;
}


async function convertItem(item){
  item.status='Converting'; render();
  try{ item.converted=await toWebP(item.file,currentMode()); item.status='Done'; }
  catch(e){ console.error(e); item.status='Error'; }
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

function toWebP(file, mode){
  return new Promise((resolve,reject)=>{
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
      const ctx = canvas.getContext('2d',{alpha:true}); ctx.drawImage(img,0,0);
      const q = mode === 'optimized' ? Number(qualityRange.value)/100 : 1;
      canvas.toBlob(blob=>{
        URL.revokeObjectURL(url);
        if(!blob) return reject(new Error('WebP conversion failed'));
        resolve({name:file.name.replace(/\.(png|jpe?g)$/i,'')+'.webp',blob});
      },'image/webp',q);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Unable to read image'));};
    img.src=url;
  });
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
